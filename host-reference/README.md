# host-reference — código do sistema original de que os módulos dependem

**Isto NÃO faz parte dos módulos.** É uma cópia, sem alterações, dos ficheiros do sistema original que os
módulos `@app/content` e `@app/social` (e a camada web/MCP deles) importam ou pressupõem.
Serve para consulta e como ponto de partida ao implementar o contrato descrito em
`docs/05-contrato-com-o-host.md`.

| Pasta | Origem | Para quê |
|---|---|---|
| `core/src/` | `packages/core/src/{common,actor,events,notifications,crypto,schedule,rate-limit}.ts` | Implementação de referência de tudo o que os módulos importam de `@app/core`. Estes ficheiros ainda importam coisas do CRM (Account, Contact, Activity...) que podem ser removidas. |
| `web/src/components/ui/`, `web/src/components/*.tsx` | `apps/web/src/components/...` | Design system e controlos de lista usados pelas telas. |
| `web/src/lib/` | `apps/web/src/lib/...` | Sessão (`requireCtx`), tradução de erros para HTTP, `ActionResult`, `issuerUrl`, cabeçalho de página, utilitários. `session.ts` depende de `lib/auth/config` (Auth.js), que não foi copiado. |
| `web/src/lib/agenda-schedule.ts` | idem | Exemplo de como a agenda do host junta os itens programados dos módulos. |
| `web/src/app/api/mcp/route.ts` | idem | Exemplo de registo do backend de imagens em processo para o MCP HTTP. |
| `web/src/middleware.ts`, `web/next.config.mjs` | `apps/web/...` | Exceções de autenticação (`/api/cron`) e `outputFileTracingIncludes`. |
| `mcp/src/util.ts` | `apps/mcp/src/util.ts` | `run`, `mcpCtx`, `runWithCtx`, backend das tools de imagem. |
| `github/cron-email.yml` | `.github/workflows/cron-email.yml` | Como os crons eram chamados no original (GitHub Actions). Ver o aviso em `docs/06` sobre a fiabilidade deste método. |

Os CSS tokens do design system (`apps/web/src/app/globals.css`) não foram copiados: as telas usam
classes Tailwind com tokens semânticos (`bg-surface`, `text-muted`, `border-border`, `bg-primary`...).
