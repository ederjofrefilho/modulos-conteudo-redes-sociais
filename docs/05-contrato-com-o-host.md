# 05 — Contrato com o projeto host

Esta é a **lista fechada** do que os módulos esperam receber do projeto onde forem integrados.
Tudo o que está aqui veio do sistema original e tem uma implementação de referência em `host-reference/`
(copiada sem alterações). O projeto destino pode usar essa cópia como ponto de partida ou
mapear para o equivalente que já tiver.

## 1. `@app/core` — usado pelos módulos (servidor)

Os módulos importam **apenas** isto de `@app/core`:

| Símbolo | Onde está a referência | O que tem de fazer |
|---|---|---|
| `type Ctx` | `host-reference/core/src/actor.ts` | `{ actor: { id, email, name, role: 'ADMIN'｜'MEMBER' }, scopes?: string[], source?: string }`. Quem está a agir. `source` vai para `Event.source` (`crm`, `mcp`, `cron`...). |
| `isAdmin(ctx)`, `requireAdmin(ctx)` | `actor.ts` | `role === 'ADMIN'`; o segundo lança `ForbiddenError`. |
| `requireScope(ctx, scope)` | `actor.ts` | Só usado pela camada web. Sem `scopes` (sessão de navegador) passa sempre; com `scopes` (token de API) exige `'*'` ou o escopo. Escopos usados: `content:read`, `content:write`. |
| `NotFoundError`, `ValidationError`, `ForbiddenError`, `RateLimitError` (+ `UnauthorizedError` na camada web) | `common.ts` | Erros de domínio. A camada HTTP traduz para 404 / 400 / 403 / 429 / 401. `ValidationError` pode levar `issues` (erros por campo, formato `zod .flatten()`). |
| `listParamsSchema`, `type ListParamsInput`, `type Paginated<T>` | `common.ts` | Paginação comum (`q`, `skip`, `take` ≤ 100) e `{ items, total, skip, take }`. |
| `events.emit(input)`, `events.sourceOf(ctx)` | `events.ts` | Grava um evento append-only **sem nunca lançar**. A lista `EVENT_TYPES` tem de aceitar `content.published`, `content.unpublished`, `social.approved`, `social.published`, `social.failed`, `social.disconnected`. |
| `notifications.createNotification(userId, { type, title, body?, url? })` | `notifications.ts` | Notificação no sino, **nunca lança**. Tipos usados: `social_review`, `social_token_expiring`. |
| `secrets.encryptSecret(plaintext, aad)`, `secrets.decryptSecret(ciphertext, aad)` | `crypto.ts` | AES-256-GCM com AAD, chave de 32 bytes em `MAILBOX_ENC_KEY`. Cifra os tokens das redes. **Perder a chave obriga a religar todas as contas.** |
| `type schedule.ScheduledItem`, `type schedule.ScheduleQuery` | `schedule.ts` | Só tipos, para `listScheduledSocialPosts`/`listScheduledContentPosts` alimentarem uma agenda do host. Opcional. |
| `assertRateLimit(key, { limit, windowMs })` | `rate-limit.ts` | Usado pelas rotas de cron (limite por IP). Usa a tabela `RateLimit`. |

Os ficheiros de referência importam outras coisas do sistema original (`events.ts` conhece Account/Contact/
Deal, `schedule.ts` lê Activity). Ao copiá-los para o projeto destino, basta manter as funções da
tabela acima; o resto pode ser removido.

## 2. `@app/db` — o Prisma Client

Os módulos fazem `import { prisma, ...enums, type Prisma } from '@app/db'`. O host tem de expor:

- `prisma` — instância do `PrismaClient` gerada com os modelos de `prisma/social-content.prisma`
  **e** os de `prisma/host-required.prisma` (ou equivalentes com os mesmos nomes de campo).
- Enums gerados: `ContentKind`, `ContentStatus`, `SocialProvider`, `SocialAccountKind`,
  `SocialAccessLevel`, `SocialPostStatus`, `UserRole`.
- Tipos: `Prisma`, `SocialAccount`.

Acessos diretos às tabelas do host feitos pelos módulos: `prisma.user` (admins ativos; id, nome,
e-mail, papel, `createdAt`), `prisma.event` (leitura de `site.page_view` no relatório),
`prisma.notification` e `prisma.rateLimit` (via core).

## 3. Camada web (Next.js) — o que as telas e rotas importam do host

Só a camada `web/` depende disto; os módulos não.

| Import | Referência | Papel |
|---|---|---|
| `@/lib/session` → `requireCtx()`, `getCtx()` | `host-reference/web/src/lib/session.ts` | Resolve o `Ctx` da sessão (ou de `Authorization: Bearer <token de API>`). `requireCtx` lança `UnauthorizedError`. |
| `@/lib/api` → `handle()`, `listQuery()`, `ok()`, `body()` | `lib/api.ts` | Envolve route handlers e traduz os erros de domínio em status HTTP. |
| `@/lib/action-result` → `ActionResult`, `toActionResult()` | `lib/action-result.ts` | Formato de retorno das server actions (`{ ok, error?, fieldErrors?, data? }`). |
| `@/lib/oauth` → `issuerUrl()` | `lib/oauth.ts` | URL pública da aplicação (`AUTH_URL`), base dos redirect URIs do OAuth das redes. |
| `@/lib/page-chrome`, `@/lib/cn`, `@/lib/useFocusTrap`, `@/lib/view-transition` | `lib/*` | Cabeçalho de página, utilitário de classes, foco em diálogos, transições. |
| `@/components/ui` | `host-reference/web/src/components/ui/*` | Design system: `Avatar Badge Button Card* Checkbox Combobox ConfirmDialog DataTable DatePicker Dialog Drawer EmptyState Field IconLinkButton Input LinkButton Menu MenuItem PageHeader PageShell Popover Segmented Select Skeleton Textarea useDataTableSelection useToast`. |
| `@/components/{ListControls,SearchInput,UrlParamSelect,TransitionLink,BulkDeleteButton,RowDeleteButton,ExportCsvButton,OwnerFilter}` | `host-reference/web/src/components/*` | Controlos de lista partilhados. |

O projeto destino tem três opções para a UI: (a) copiar `host-reference/web` e os tokens de CSS do
CRM; (b) reescrever esses imports para o design system próprio (os nomes acima são a lista
completa); (c) usar só os módulos e escrever telas novas sobre a API deles.

Além disso, a camada web original assume:

- **Middleware** que exige sessão em todas as páginas e em `/api/*`, exceto `/api/cron/*`
  (protegido por `CRON_SECRET` dentro da rota) e pedidos com `Authorization: Bearer`
  (validados dentro da rota). Ver `host-reference/web/src/middleware.ts`.
- **`next.config.mjs`** com `outputFileTracingIncludes` para `/api/content/assets/*` e `/api/mcp`
  (as fontes e o catálogo de mídia são lidos do disco) e `sharp` como dependência do app.
- **Navegação**: registar `/conteudo`, `/social`, `/social/desempenho` e `/settings/social` no menu do host.

## 4. Servidor MCP — o que as tools importam do host

`mcp/src/tools/*.ts` importam de `../util.js` (referência em `host-reference/mcp/src/util.ts`):

| Símbolo | Papel |
|---|---|
| `run(fn)`, `ok(data)`, `fail(msg)` | Padronizam a resposta JSON das tools e convertem erros. |
| `mcpCtx()` | Resolve o `Ctx` da sessão MCP (no original: utilizador de `MCP_ACTOR_EMAIL`, `source = 'mcp'`). |
| `runWithCtx(ctx, fn)` | Usado pela rota HTTP `/api/mcp` para executar com o utilizador autenticado. |
| `getContentImageBackend()` / `setContentImageBackend()` | Backend das tools de imagem. Em processo (rota `/api/mcp`, ver `host-reference/web/src/app/api/mcp/route.ts`) chama `images.renderContentImage` direto; no servidor stdio usa HTTP com `CRM_URL` + `CRM_API_TOKEN`. |

Registo: `registerContentTools(server)` (inclui as de imagem/vídeo) e `registerSocialTools(server)`.

## 5. Integrações opcionais com o host

| Integração | Onde | Se não existir |
|---|---|---|
| Agenda que mostra o que está programado | `listScheduledSocialPosts`, `listScheduledContentPosts` (ver `host-reference/web/src/lib/agenda-schedule.ts`) | Nada muda nos módulos. |
| Site que lê os artigos e recebe revalidação | `/api/content/posts*`, `notifySiteRevalidate`, prévia por token | `notifySiteRevalidate` só avisa no log. |
| Visitas ao site por post (UTM) | `Event` com `site.page_view` e `utm_content` | Coluna de visitas vazia no painel. |
| Proxy de imagens de e-mail | `downloadImage` (usado por `/api/email/image` no CRM) | Não se aplica. |
