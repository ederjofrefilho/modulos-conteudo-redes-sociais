# 03 — Módulo de publicação nas redes sociais (`@app/social`)

Pasta: `modules/social`. Telas em `web/src/app/(app)/social` e `web/src/app/(app)/settings/social`.

## Responsabilidades

1. **Contas ligadas** (`SocialAccount`) no LinkedIn (perfil pessoal ou Página) e no Instagram
   (conta profissional), por OAuth, com tokens cifrados.
2. **Permissões**: conta pessoal (só o dono e ADMIN) ou conta da empresa partilhada, com nível de
   acesso por utilizador (`SocialAccountAccess`).
3. **Posts** (`SocialPost`): texto + mídia da biblioteca de conteúdo + link, validados por rede,
   com revisão, aprovação humana e agendamento.
4. **Publicação automática** no horário, com trava, idempotência e retoma de envios parciais
   (imagem, carrossel, vídeo/Reels, story).
5. **Sincronização** das publicações feitas diretamente na rede (histórico) com cópia da mídia.
6. **Métricas** por post e seguidores por conta, com histórico próprio, e o **painel de desempenho**.

## Mapa dos ficheiros

| Ficheiro | Papel |
|---|---|
| `src/index.ts` | API pública (ver abaixo). |
| `src/posts.ts` | Criar, editar, agendar/desagendar, **aprovar**, submeter para revisão, devolver, arquivar, tentar de novo, duplicar, tema em massa, listagem para a tela. |
| `src/publish.ts` | `claimForPublishing` (trava), `publishSocialPost`, `publishDueSocialPosts` (cron). |
| `src/status.ts` | **Puro**: estados, transições, `displayState` (estado de tela), `PUBLISHING_STALE_MS`. |
| `src/rules.ts` | **Puro**: limites e validação por rede (`validateSocialDraft`), `foldIndex` ("ver mais"). |
| `src/accounts.ts` | Ligar/desligar conta, cifra de tokens, contas a vencer (`notifyExpiringAccounts`, `deactivateExpiredAccounts`). |
| `src/access.ts` / `src/access-rules.ts` | Permissões (serviço / regras puras `@app/social/access`). |
| `src/linkedin-connect.ts`, `linkedin-pages.ts`, `linkedin-refresh.ts` | OAuth do LinkedIn (perfil e Página), renovação quando há refresh token. |
| `src/instagram-connect.ts` | OAuth do Instagram, token longo, renovação automática. |
| `src/providers/` | Adaptadores de publicação: `linkedin.ts` (+ `linkedin-text.ts`, `linkedin-pdf.ts`), `instagram.ts`, `simulated.ts`, registo em `index.ts`. |
| `src/utm.ts` | **Puro**: acrescenta `utm_*` ao link no momento de publicar. |
| `src/schedule.ts` | `listScheduledSocialPosts` — itens para a agenda do host (opcional). |
| `src/metrics/` | Adaptadores de leitura de métricas, recolha (`collect.ts`), fórmula (`engagement.ts`), relatório do painel (`report.ts`, `analyze.ts`), leitura para agentes (`agent.ts`), importação de posts externos (`import.ts`). |
| `src/sync/` | Listagem de posts da rede (`remote-posts.ts`) e loja da cópia da mídia (`media-store.ts`). |
| `src/remote.ts` | **Puro**: formato do JSON `SocialPost.remote` (como o post está na rede). |

## API pública (`import ... from '@app/social'`)

```ts
export * as socialPosts from './posts.js';
export * as socialAccounts from './accounts.js';
export * as socialAccess from './access.js';
export * from './access-rules.js';
export * from './remote.js';
export { publishSocialPost, publishDueSocialPosts, claimForPublishing } from './publish.js';
export * from './rules.js';
export * from './status.js';
export { publishMode, registerProvider, getProvider } from './providers/index.js';
export { SocialPublishError, type SocialProviderAdapter, type PublishInput, type PublishResult } from './providers/types.js';
export { connectLinkedinFromCode, linkedinCredentials, linkedinPagesCredentials, linkedinAuthorizeUrl, LINKEDIN_SCOPES, ... };
export { connectInstagramFromCode, refreshExpiringInstagramTokens, instagramCredentials, instagramAuthorizeUrl, INSTAGRAM_SCOPES };
export { refreshExpiringLinkedinTokens };
export { withUtm, utmParams } from './utm.js';
export * from './metrics/engagement.js';
export * as socialMetrics from './metrics/report.js';
export { collectSocialMetrics, getMetricsCapabilities } from './metrics/collect.js';
export * as socialAgentMetrics from './metrics/agent.js';
export { importExternalPosts, importDueAccounts, setImportPosts, syncUnavailableReason } from './metrics/import.js';
export { setRemoteMediaStore } from './sync/media-store.js';
export { listScheduledSocialPosts } from './schedule.js';
```

## Ciclo de vida de um post

```
            criar (UI ou MCP)
                  │
                  ▼
   ┌──────────── DRAFT ◀───────────────┐  editar texto/mídia/link/conta/placement
   │  (isIdea = "Ideia")               │  de um APPROVED ou FAILED volta a DRAFT
   │  submeter p/ revisão (DRAFT-only) │  e limpa a aprovação
   │  devolver com comentário          │
   │                                   │
   │  aprovar  (SÓ humano, SÓ na UI)   │
   ▼                                   │
 APPROVED ── scheduledAt futuro = "Agendado" / nulo ou vencido = "Na fila"
   │
   │  cron ou "publicar agora": claimForPublishing (updateMany condicional)
   ▼
 PUBLISHING ──(rede ainda processa vídeo)──▶ volta a APPROVED com providerState (até 12 tentativas)
   │                    │
   ▼                    ▼
 PUBLISHED            FAILED ── "Tentar de novo" ──▶ APPROVED
 (externalId)          (lastError legível)

 ARCHIVED: arquivar a partir de qualquer estado, exceto PUBLISHING. PUBLISHING preso > 15 min → FAILED
 ("confira na rede antes de tentar de novo") — nunca republica sozinho.
```

Regras que garantem que **um post nunca sai duas vezes**:
- Reserva atómica APPROVED → PUBLISHING (`updateMany` com condição de estado, horário e `externalId: null`).
- `externalId` preenchido = já foi ao ar; nunca volta a ser reservado.
- Progresso parcial do fornecedor em `providerState` (imagens já enviadas, containers do Instagram,
  urn de vídeo/documento do LinkedIn): tentar de novo reaproveita em vez de reenviar.

Mudar **só o horário** de um APPROVED não tira a aprovação. Desagendar um APPROVED volta a DRAFT
(sem horário, aprovado significaria publicar já).

## Permissões

| Quem | Conta pessoal | Conta da empresa (`shared = true`) |
|---|---|---|
| ADMIN | tudo | tudo; só ADMIN liga a conta e gere acessos |
| Dono (`ownerId`) | tudo | — |
| Outros | nada | conforme `SocialAccountAccess.level` |

Níveis cumulativos: `VIEW` (vê os posts) < `DRAFT` (cria rascunhos e submete para revisão) <
`PUBLISH` (aprova, agenda, publica). `canViewMetrics` é um direito à parte. As regras puras estão em
`access-rules.ts`; quem decide é `access.ts`, chamado em **todas** as funções de `posts.ts` que
recebem `ctx` — a UI, o MCP e a API passam pela mesma regra.

Revisão: quem só tem `DRAFT` chama `submitSocialPost` (`reviewState = "pending"`, notifica quem pode
publicar); quem publica aprova ou `returnSocialPost` com comentário (notifica o autor).

## Validação por rede (`rules.ts`, também usada no navegador)

| | Instagram | LinkedIn |
|---|---|---|
| Texto | ≤ 2.200, ≤ 30 hashtags, ≤ 20 menções | ≤ 3.000 |
| Imagens | 1–10, JPEG ≤ 8 MB, 320–1440 px, proporção 4:5 a 1,91:1 | 0–20, JPG/PNG/GIF < 36 Mpx; 2+ imagens viram documento PDF (carrossel) — só JPG/PNG |
| Vídeo | MP4/MOV, ≤ 300 MB, 3 s–15 min (story ≤ 60 s), sai como Reels | MP4, 75 KB–500 MB, 3 s–30 min |
| Combinações | feed, reel ou story (story sem legenda) | imagem **ou** link com prévia, nunca os dois; vídeo sozinho |
| "Ver mais" | ~125 caracteres / 2 linhas | ~210 caracteres / 3 linhas |

Ao criar/editar, os problemas voltam como `issues` (avisos). Ao aprovar e ao publicar, bloqueiam.
O teto de vídeo do sistema é 200 MB (`@app/content/media`), abaixo das redes, porque a função
do LinkedIn baixa e reenvia o ficheiro dentro dos 60 s do cron.

## Publicação por rede

- **Modo**: `SOCIAL_PUBLISH=live` publica de verdade; qualquer outro valor **simula** (marca PUBLISHED
  com `externalId = simulated:<id>`). A tela mostra "Modo simulação".
- **LinkedIn** (`providers/linkedin.ts`, só `fetch`): Posts API. Uma imagem via Images API; 2–20
  imagens juntadas num PDF (`pdf-lib`) e publicadas pela Documents API (carrossel deslizável);
  vídeo pela Videos API (partes com ETag → finalize → espera AVAILABLE). A Posts API não raspa o link:
  título/descrição/miniatura vêm do artigo de origem (`linkPreview`). Texto convertido para
  "little text" (`linkedin-text.ts`), preservando `#hashtags`. Versão da API: mês de dois meses atrás
  (`LINKEDIN_API_VERSION` força).
- **Instagram** (`providers/instagram.ts`, Instagram API com login do Instagram, sem página do
  Facebook): verifica `content_publishing_limit` → cria container(s) (carrossel com filhos) →
  espera `FINISHED` → `media_publish` → `permalink`. Vídeo como `REELS`.
- **Erros** viram `SocialPublishError` com mensagem pronta para a tela: token inválido → "reconecte"
  e conta desativada; 403/permissão; limite (429 / códigos 4, 9, 17, 32, 613); "ainda processando"
  (`retryLater`) não é falha.
- **UTM**: com `utmAuto`, `withUtm` acrescenta `utm_source/medium/campaign/content` só na saída
  (`utm_content` = id do post). O link guardado fica como foi escrito.

## Tokens e contas

- Tokens cifrados com `secrets.encryptSecret` do host (AES-256-GCM) e AAD `social:<provider>:<externalId>`;
  nunca em log, evento ou resposta de tool. Desligar apaga os tokens.
- Instagram: token longo (~60 dias) renovado sozinho pelo cron quando faltam < 10 dias.
- LinkedIn: ~60 dias; renova só se o app tiver refresh token programático. Aviso no sino 7 dias antes.
- `deactivateExpiredAccounts` desativa contas vencidas antes de publicar (o post falha com "reconecte").
- LinkedIn Página pode usar um app separado (`LINKEDIN_PAGES_CLIENT_ID/SECRET`), porque o LinkedIn
  costuma exigir a Community Management API sozinha num app.

## Sincronização e métricas

- **Importar publicações da rede** (`metrics/import.ts`): contas com `importPosts = true`, a cada ~3 h
  (cron `social-metrics`) ou pelo botão da tela. Upsert por `externalId`: um post publicado pelo
  sistema só ganha o campo `remote`, nunca um duplicado. A mídia é copiada pelo `RemoteMediaStore`
  (as URLs do Instagram expiram). Perfil pessoal do LinkedIn não sincroniza (exige `r_member_social`).
- **Recolha** (`collectSocialMetrics`): por idade do post — < 2 dias de hora a hora, < 30 dias a cada
  20 h, < 180 dias a cada 6 dias, depois para. Seguidores a cada ~20 h. Grava **totais acumulados**
  (não deltas) em `SocialPostMetric`/`SocialAccountMetric`; o último snapshot também em
  `SocialPost.metrics`. `null` = a rede não deu essa métrica (nunca zero).
- **Fórmula única** (`metrics/engagement.ts`): interações = reações + comentários + partilhas +
  guardados; taxa = interações ÷ impressões × 100 (alcance quando não há impressões).
- **Painel** (`metrics/report.ts`): KPIs com comparação ao período anterior, evolução diária
  (`dailyGains`), top/piores, por formato e tema, melhores dias e horas (`REPORT_TIMEZONE =
  America/Sao_Paulo`), CSV. Visitas ao site vindas de cada post são lidas da tabela `Event` do host
  (`site.page_view` com `utm_content` = id do post) — sem esses eventos, essa coluna fica vazia.

## Eventos e notificações gravados no host

- Eventos: `social.approved`, `social.published`, `social.failed`, `social.disconnected` (payload só com
  ids, rede, URL e erro).
- Notificações: `social_review` (post à espera de revisão / devolvido), `social_token_expiring`.

## Telas (camada web)

- `/social` — fila, calendário e lista (todas as vistas filtram no navegador a mesma lista), composer em
  painel (`?post=<id>`, `?novo=1`), prévia fiel por rede, aprovar/agendar por diálogo, arrastar no
  calendário muda só a data. `/social/novo` e `/social/[id]` só redirecionam.
- `/social/desempenho` — painel de métricas.
- `/settings/social` — contas, validade, último erro, ligar/desligar, sincronização, acessos por utilizador.
