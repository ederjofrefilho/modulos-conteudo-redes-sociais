# 08 — Integração passo a passo no projeto destino

Roteiro de integração; cada passo termina com a forma de confirmar que ficou certo.
Pressupõe um monorepo TypeScript (pnpm/npm/yarn workspaces) com Next.js 15 e PostgreSQL. Noutra stack,
os módulos (`modules/*`, `packages/content-contract`) continuam reutilizáveis; só a camada `web/` muda.

## 1. Copiar os pacotes

```
modules/content           → <projeto>/modules/content        (@app/content)
modules/social            → <projeto>/modules/social         (@app/social)
packages/content-contract → <projeto>/packages/content-contract
```

Os `package.json` usam `"workspace:*"` para `@app/core`, `@app/db` e entre si. Se o projeto não
usa o escopo `@app`, há duas saídas: manter os nomes (mais simples) ou renomear com um
"procurar e substituir" em todos os imports. Dependências externas dos módulos: `zod`,
`sanitize-html` (content), `pdf-lib` (social).

✔ `tsc --noEmit` nos dois pacotes só deve reclamar de `@app/core` e `@app/db` (passos 2 e 3).

## 2. Fornecer `@app/core`

Opção A — criar um pacote `@app/core` mínimo a partir de `host-reference/core/src/`, mantendo só
o que a tabela de `docs/05` lista, e um `index.ts`:

```ts
export * from './common.js';               // erros, listParamsSchema, Paginated
export * from './actor.js';                // Ctx, isAdmin, requireAdmin, requireScope
export * from './rate-limit.js';           // assertRateLimit, RateLimitError
export * as events from './events.js';     // emit, sourceOf (EVENT_TYPES com content.* e social.*)
export * as notifications from './notifications.js';
export * as secrets from './crypto.js';
export * as schedule from './schedule.js'; // basta manter os tipos ScheduledItem e ScheduleQuery
```

Opção B — se o projeto já tem um core, criar um alias `@app/core` que reexporte os equivalentes com
estes nomes e assinaturas.

✔ `tsc` dos módulos passa a reclamar só de `@app/db`.

## 3. Banco e `@app/db`

1. Juntar `prisma/social-content.prisma` ao schema e garantir o que `prisma/host-required.prisma`
   pede (relações no `User`, `Notification`, `Event`, `RateLimit`).
2. `prisma validate`, depois gerar a migration (`prisma migrate dev --name social_content`).
3. Expor um pacote `@app/db` que exporte o client e os tipos:
   ```ts
   export { PrismaClient, Prisma } from '@prisma/client';
   export * from '@prisma/client';            // enums e tipos de modelo
   export const prisma = globalThis.__prisma ?? new PrismaClient();
   ```

✔ `tsc --noEmit` dos três pacotes sem erros. ✔ `vitest run` nos testes puros dos módulos
(`*.test.ts` sem `.db.`) passa sem banco.

## 4. Camada web

1. Copiar `web/src/app/(app)/{conteudo,social,settings/social}`, `web/src/app/api/{content,social}`,
   `web/src/app/api/cron/{publish-social,social-metrics,publish-scheduled}`, `web/src/components/{content,social}`,
   `web/src/lib/{content-images,content-videos.ts,social-media-store.ts,social-oauth.ts}`,
   `web/public/conteudo-midia` e `web/assets/fonts` para os mesmos caminhos no app Next.js.
2. Resolver os imports de `@/components/ui`, `@/components/*` e `@/lib/*` (ver `docs/05`, secção 3):
   copiar de `host-reference/web/` ou apontar para o design system do projeto.
3. Dependências do app: `next@15`, `react@19`, `@tiptap/*@3`, `recharts@3`, `@dnd-kit/core`,
   `sharp`, `@vercel/blob`, `lucide-react`, `zod`. `sharp` tem de ser dependência **direta** do app.
4. `next.config`: `transpilePackages` para os pacotes `@app/*` e `outputFileTracingIncludes` para
   `/api/content/assets/*` (e `/api/mcp`, se usar) incluindo `assets/fonts/**` e `public/conteudo-midia/**`
   (ver `host-reference/web/next.config.mjs`).
5. Middleware: deixar `/api/cron/*` passar sem sessão (a rota confere o `CRON_SECRET`).
6. Menu: acrescentar `/conteudo`, `/social`, `/social/desempenho`, `/settings/social`.

✔ `next build` sem erros de import. ✔ Abrir `/conteudo/imagens`, escolher um modelo e ver a prévia
(funciona sem armazenamento configurado).

## 5. Armazenamento

Configurar o Blob (ou trocar os adaptadores, ver `docs/07`). URLs têm de ser públicas.

✔ Gerar e guardar uma imagem em `/conteudo/imagens`; ela aparece no seletor de mídia do composer social.

## 6. Redes sociais

1. Criar os apps (LinkedIn e Meta/Instagram) seguindo `docs/09-configurar-apps-linkedin-instagram.md`.
2. Registar os redirect URIs `<AUTH_URL>/api/social/linkedin/callback` e `<AUTH_URL>/api/social/instagram/callback`.
3. Definir as variáveis (`docs/07`). Deixar `SOCIAL_PUBLISH` **sem** `live` no início.
4. Ligar as contas em `/settings/social`.

✔ Criar um post, aprovar, e ver ficar "Publicado" com `externalId = simulated:...` (modo simulação).

## 7. Agendador

Configurar as três chamadas de cron com o `CRON_SECRET` (frequências em `docs/06`) e monitorizar a
última execução. Só então mudar `SOCIAL_PUBLISH=live`.

✔ Um post aprovado com horário daqui a 5 minutos sai sozinho até ~5 minutos depois da hora.

## 8. MCP (opcional)

Copiar `mcp/src/tools/*.ts`, fornecer `../util.js` (ver `host-reference/mcp/src/util.ts`) e registar
`registerContentTools(server)` e `registerSocialTools(server)`. Na rota HTTP, registar o backend de
imagens em processo com `setContentImageBackend` (ver `host-reference/web/src/app/api/mcp/route.ts`).

✔ `list_social_accounts` devolve as contas; confirmar que não existe nenhuma tool de aprovar/publicar post social.

## Cuidados que não se veem no código

- Nunca expor aprovação ou publicação de post social a automação (MCP, API): é a garantia de que
  nada sai sem um humano.
- `MAILBOX_ENC_KEY` tem de ser a mesma em todos os processos que leem tokens (web, cron, MCP).
- Sem um agendador fiável, a publicação "no horário" não acontece: o sistema só publica quando o cron é chamado.
- Partes que, à data da extração, nunca tinham corrido contra a API real (escritas a partir da
  documentação e testadas com `fetch` falso): publicação de **vídeo** nas duas redes e o adaptador de
  **métricas do LinkedIn**. Valide-os com uma conta de teste antes de confiar.
