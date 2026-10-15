# 04 — Modelo de dados

Ficheiros em `prisma/`:

| Ficheiro | Conteúdo |
|---|---|
| `social-content.prisma` | Os 7 modelos e 6 enums dos módulos, **copiados verbatim** do schema do sistema original (com os comentários originais). |
| `host-required.prisma` | O mínimo que os módulos esperam encontrar no banco do host: `User` (com as relações), `Notification`, `Event`, `RateLimit`. |
| `migration-consolidada.sql` | SQL PostgreSQL das 7 tabelas, na ordem em que foram criadas em produção. Pressupõe que a tabela `"User"` já existe. |
| `migrations-originais/` | As 9 migrations originais que criaram/alteraram estas tabelas (uma delas é um excerto: a original também mexia em tabelas de anúncios). |

## Tabelas dos módulos

| Tabela | Módulo | Para quê |
|---|---|---|
| `ContentPost` | content | Artigo (`ARTICLE`) ou caso de sucesso (`CASE`). Corpo em `blocks` (JSON validado por `@app/content-contract`). |
| `ContentAsset` | content | Imagem ou vídeo da biblioteca (URL pública, dimensões, bytes, tipo, alt, duração). |
| `SocialAccount` | social | Conta ligada numa rede. Tokens cifrados. Pessoal (`ownerId`) ou da empresa (`shared`). |
| `SocialAccountAccess` | social | Nível de acesso de um utilizador a uma conta partilhada. |
| `SocialPost` | social | Uma publicação num destino (uma conta). Variações da mesma ideia em redes diferentes partilham `campaignKey`. |
| `SocialPostMetric` | social | Histórico de métricas de um post (totais acumulados por recolha). |
| `SocialAccountMetric` | social | Histórico de seguidores de uma conta. |

Enums: `ContentKind`, `ContentStatus`, `SocialProvider`, `SocialAccountKind`, `SocialAccessLevel`, `SocialPostStatus`.

## Relações

```
User ─┬─< ContentPost.authorId                 (ContentAuthor)
      ├─< ContentAsset.uploadedById            (ContentAssetUploader)
      ├─< SocialAccount.connectedById / ownerId
      ├─< SocialAccountAccess.userId / grantedById
      └─< SocialPost.createdById / approvedById / submittedById / reviewedById / scheduledById / publishedById

ContentAsset ─< ContentPost.coverAssetId        (FK, onDelete: SetNull)
ContentPost  ─< SocialPost.sourceContentPostId  (FK, onDelete: SetNull)  "post nasceu deste artigo"
SocialAccount ─< SocialPost.socialAccountId     (FK, onDelete: Restrict)
SocialAccount ─< SocialAccountAccess, SocialAccountMetric   (onDelete: Cascade)
SocialPost    ─< SocialPostMetric                           (onDelete: Cascade)

SocialPost.mediaAssetIds: String[]  → ids de ContentAsset, na ordem do carrossel. SEM FK (array):
                                      o serviço confere que existem ao gravar e de novo ao publicar.
```

## Campos JSON (forma documentada no código)

| Campo | Forma |
|---|---|
| `ContentPost.blocks` | `ContentBlock[]` — ver `packages/content-contract/src/blocks.ts`. `blocksVersion` para mudanças futuras de forma. |
| `SocialPost.providerState` | Progresso parcial do fornecedor (chaves `instagram` — `children`/`container` —, `linkedinImages`, `linkedinDocument`, `linkedinVideo`; `simulated` em modo simulação). Nunca guarda segredo. |
| `SocialPost.metrics` | Último snapshot (`impressions`, `reach`, `reactions`, `comments`, `shares`, `saves`, `clicks`, `videoViews`). |
| `SocialPost.remote` | Como o post está na rede (tipo e itens de mídia com cópia local). Ver `modules/social/src/remote.ts`. |
| `SocialPostMetric.raw` / `SocialAccountMetric.raw` | Resposta crua da API, sem token, para auditar/reprocessar. |

## Tabelas do host que os módulos também usam (via `@app/core`)

| Tabela | Uso |
|---|---|
| `User` | Autor, aprovador, dono de conta; listas de admins (`role = ADMIN`, `isActive`), `createdAt` para escolher o admin mais antigo na importação. |
| `Notification` | `notifications.createNotification` (sino). |
| `Event` | `events.emit` (registo append-only) e leitura de `site.page_view` no painel de desempenho. |
| `RateLimit` | `assertRateLimit` nas rotas de cron. |

No sistema original, `Event` também tem FKs para `Account`/`Contact`/`Deal`. Estes módulos nunca preenchem
esses campos; em `host-required.prisma` eles ficam como texto sem FK.

## Como criar as tabelas no projeto destino

**Com Prisma (recomendado):**
1. Juntar o conteúdo de `social-content.prisma` ao schema do projeto.
2. Garantir no `User` do projeto as relações listadas em `host-required.prisma` (bloco "Relações
   exigidas") e os modelos `Notification`, `Event` e `RateLimit` (ou equivalentes, ver `docs/05`).
3. `prisma migrate dev --name social_content` (ou `migrate diff` + `migrate deploy`).

**Sem Prisma no schema do projeto:** aplicar `migration-consolidada.sql` num Postgres que já tenha
`"User"("id" TEXT)`. Os `ENABLE ROW LEVEL SECURITY` vêm do original (Supabase com API pública) e
podem ser removidos noutros ambientes. O código dos módulos continua a precisar de um Prisma Client
gerado com estes modelos, porque faz as consultas por `prisma.contentPost`, `prisma.socialPost`, etc.

> Nota: o schema não pôde ser validado com `prisma validate` no momento da extração (o ambiente não
> tinha acesso aos binários do Prisma). Os blocos foram copiados sem alteração do schema que está em
> produção; `host-required.prisma` é uma redução escrita à mão — confirme com `prisma validate` ao integrar.
