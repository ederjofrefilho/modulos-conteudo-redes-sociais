# 06 — Telas, rotas HTTP, crons e tools MCP

## Telas (`web/src/app/(app)/`)

| Rota | Ficheiro | O que é |
|---|---|---|
| `/conteudo` | `conteudo/page.tsx` | Lista de artigos e casos (filtros, ações em massa, novo). |
| `/conteudo/[id]` | `conteudo/[id]/page.tsx` | Editor do artigo (blocos, definições, prévia, publicar/agendar). |
| `/conteudo/imagens` | `conteudo/imagens/page.tsx` | Gerador de imagens por modelos. |
| `/social` | `social/page.tsx` | Fila, calendário e lista de posts; composer em painel (`?post=<id>`, `?novo=1`). |
| `/social/novo`, `/social/[id]` | `social/novo/page.tsx`, `social/[id]/page.tsx` | Só redirecionam para o painel de `/social`. |
| `/social/desempenho` | `social/desempenho/page.tsx` | Painel de métricas. |
| `/settings/social` | `settings/social/page.tsx` | Contas ligadas, validade, sincronização, acessos. |

Server actions (adaptadores finos sobre os módulos): `conteudo/actions.ts`, `social/actions.ts`,
`social/account-actions.ts`. **`approveSocialPostAction` é o único caminho de aprovação** de um post social.

## Rotas HTTP (`web/src/app/api/`)

Autenticação: sessão de navegador **ou** `Authorization: Bearer <token de API>` com o escopo indicado.

| Método e rota | Escopo | Função |
|---|---|---|
| `POST /api/content/assets/upload` | `content:write` | Emite token de upload direto ao Vercel Blob (`handleUpload`). Só funciona com Blob configurado. |
| `POST /api/content/assets/render` | `content:write` | Gera e grava uma imagem a partir de um modelo. |
| `POST /api/content/assets/preview` | `content:write` | Gera a imagem e devolve o JPEG sem gravar. |
| `POST /api/content/assets/import` | `content:write` | Importa uma imagem por URL. |
| `POST /api/content/assets/import-video` | `content:write` | Importa um MP4 por URL. |
| `POST /api/content/assets/register-video` | `content:write` | Regista um vídeo já enviado ao Blob do próprio sistema. |
| `GET /api/content/posts` | `content:read` | Lista posts **publicados** (contrato com o site). `?kind=ARTICLE｜CASE`, `q`, `skip`, `take`. |
| `GET /api/content/posts/[slug]` | `content:read` | Um post publicado pelo slug. |
| `GET /api/content/preview/[id]?token=` | token HMAC | Post em qualquer estado, para a prévia por iframe (token de 15 min, `SITE_PREVIEW_SECRET`). |
| `GET /api/social/linkedin/connect` | sessão | Início do OAuth do LinkedIn. `?pagina=1` = Página da empresa (app de Páginas, só ADMIN); `?metricas=1` = pede também os escopos de leitura de posts/perfil. |
| `GET /api/social/linkedin/callback` | sessão | Retorno do OAuth; resultado num cookie de recado para `/settings/social`. |
| `GET /api/social/instagram/connect` | sessão | Início do OAuth do Instagram (`?partilhada=1`, `?metricas=0`). |
| `GET /api/social/instagram/callback` | sessão | Retorno do OAuth do Instagram. |

O `state` do OAuth vai num cookie curto e é comparado em tempo constante (`web/src/lib/social-oauth.ts`).
O redirect URI é `<AUTH_URL>/api/social/<rede>/callback` — tem de estar registado no app da rede.

## Crons

Todos `GET`, protegidos por `Authorization: Bearer $CRON_SECRET` e por limite de 10 pedidos/min por IP.
`runtime = 'nodejs'`, `maxDuration = 60`.

| Rota | Frequência necessária | O que faz |
|---|---|---|
| `/api/cron/publish-social` | **a cada 1–5 min** | Renova tokens do Instagram (e do LinkedIn quando há refresh), avisa tokens a vencer, desativa contas vencidas, publica até 10 posts aprovados e vencidos (em série). |
| `/api/cron/social-metrics` | a cada 1–3 h | Importa publicações externas das contas com sincronização ligada (~3 h por conta) e recolhe métricas (até 20 posts por passada; a cadência por idade é decidida no serviço). |
| `/api/cron/publish-scheduled` | a cada 5–15 min | Publica no site os artigos agendados vencidos (até 25). |

> **Atenção — lição do sistema original.** No sistema original estes crons eram chamados por um workflow do
> GitHub Actions agendado de 5 em 5 minutos (`host-reference/github/cron-email.yml`). Na prática, o
> GitHub corre agendamentos com atrasos de minutos a horas, e em 15/10/2026 um post aprovado ficou
> por publicar depois da hora marcada sem nenhuma tentativa registada (`attempts = 0`) — a causa
> provável é o cron não ter sido chamado a tempo. No projeto destino
> use um agendador que garanta a frequência (cron nativo do alojamento num plano que permita
> execução por minuto, cron-job.org, Cloud Scheduler, um worker próprio...) e monitorize a última
> execução.

## Tools MCP (`mcp/src/tools/`)

Cada tool é uma chamada a uma função do módulo, através de `run()`. Nenhuma tool gera texto: quem
escreve é o modelo do outro lado; as tools só validam e gravam.

**Conteúdo** (`content.ts`, `content-images.ts`)

| Tool | Função |
|---|---|
| `list_posts`, `get_post` | Listar/detalhar artigos e casos (com blocos). |
| `create_post`, `update_post` | Criar/editar (blocos validados e sanitizados). |
| `publish_post`, `unpublish_post` | Publicar no site / despublicar (portões de publicação aplicados). |
| `schedule_post`, `cancel_schedule` | Agendar / cancelar agendamento. |
| `list_content_assets` | Biblioteca de mídia (`kind: image｜video`). |
| `render_content_image` | Gerar imagem a partir de um modelo (texto escrito pelo modelo de IA). |
| `import_content_image` | Importar imagem por URL. |
| `import_content_video` | Importar MP4 por URL. |
| `upload_content_video` | Só no servidor stdio local: lê o ficheiro, sobe ao Blob com o token de upload e regista. |

**Redes sociais** (`social.ts`)

| Tool | Função |
|---|---|
| `list_social_accounts` | Contas que o utilizador da sessão pode usar. |
| `create_social_post`, `update_social_post` | Criar/editar rascunho (devolve `issues` por rede). |
| `schedule_social_post`, `unschedule_social_post` | Pôr/tirar horário (num rascunho é só "horário sugerido"). |
| `list_social_posts`, `get_social_post` | Listar/detalhar com `issues`. |
| `submit_social_post` | Enviar para revisão (quem só tem nível DRAFT). |
| `get_social_post_metrics` | Métricas e explicação de porque falta algum número. |

**Não existe, e não deve existir, tool para aprovar ou publicar um post social.** No CRM original, o
smoke test do MCP falha se aparecer uma tool `approve_social*` ou `publish_social*`.
