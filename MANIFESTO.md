# MANIFESTO — origem de cada ficheiro

A coluna "Origem" indica o caminho do ficheiro no sistema original (monorepo privado).
Os ficheiros com origem indicada foram copiados sem alterações de lógica; nomes de pessoas, domínios e a marca original foram trocados por marcadores neutros, e as imagens de `web/public/conteudo-midia` são marcadores para substituir. Os marcados como novos foram escritos para esta extração.
Total: 325 ficheiros.

## `(raiz)`

| Neste repositório | Origem |
|---|---|
| `.gitignore` | (novo — escrito para esta extração) |
| `MANIFESTO.md` | (novo — escrito para esta extração) |
| `PERSONALIZAR.md` | (novo — escrito para esta extração) |
| `README.md` | (novo — escrito para esta extração) |

## `docs`

| Neste repositório | Origem |
|---|---|
| `docs/01-visao-geral.md` | (novo — escrito para esta extração) |
| `docs/02-modulo-conteudo.md` | (novo — escrito para esta extração) |
| `docs/03-modulo-redes-sociais.md` | (novo — escrito para esta extração) |
| `docs/04-modelo-de-dados.md` | (novo — escrito para esta extração) |
| `docs/05-contrato-com-o-host.md` | (novo — escrito para esta extração) |
| `docs/06-rotas-cron-e-mcp.md` | (novo — escrito para esta extração) |
| `docs/07-configuracao-e-variaveis.md` | (novo — escrito para esta extração) |
| `docs/08-integracao-passo-a-passo.md` | (novo — escrito para esta extração) |
| `docs/09-configurar-apps-linkedin-instagram.md` | `docs/redes-sociais-setup.md` |

## `host-reference`

| Neste repositório | Origem |
|---|---|
| `host-reference/README.md` | (novo — escrito para esta extração) |
| `host-reference/core/src/actor.ts` | `packages/core/src/actor.ts` |
| `host-reference/core/src/common.ts` | `packages/core/src/common.ts` |
| `host-reference/core/src/crypto.ts` | `packages/core/src/crypto.ts` |
| `host-reference/core/src/events.ts` | `packages/core/src/events.ts` |
| `host-reference/core/src/notifications.ts` | `packages/core/src/notifications.ts` |
| `host-reference/core/src/rate-limit.ts` | `packages/core/src/rate-limit.ts` |
| `host-reference/core/src/schedule.ts` | `packages/core/src/schedule.ts` |
| `host-reference/github/cron-email.yml` | `.github/workflows/cron-email.yml` |
| `host-reference/mcp/src/util.ts` | `apps/mcp/src/util.ts` |
| `host-reference/web/next.config.mjs` | `apps/web/next.config.mjs` |
| `host-reference/web/src/app/api/mcp/route.ts` | `apps/web/src/app/api/mcp/route.ts` |
| `host-reference/web/src/components/BulkDeleteButton.tsx` | `apps/web/src/components/BulkDeleteButton.tsx` |
| `host-reference/web/src/components/ExportCsvButton.tsx` | `apps/web/src/components/ExportCsvButton.tsx` |
| `host-reference/web/src/components/ListControls.tsx` | `apps/web/src/components/ListControls.tsx` |
| `host-reference/web/src/components/OwnerFilter.tsx` | `apps/web/src/components/OwnerFilter.tsx` |
| `host-reference/web/src/components/RowDeleteButton.tsx` | `apps/web/src/components/RowDeleteButton.tsx` |
| `host-reference/web/src/components/SearchInput.tsx` | `apps/web/src/components/SearchInput.tsx` |
| `host-reference/web/src/components/TransitionLink.tsx` | `apps/web/src/components/TransitionLink.tsx` |
| `host-reference/web/src/components/UrlParamSelect.tsx` | `apps/web/src/components/UrlParamSelect.tsx` |
| `host-reference/web/src/components/ui/Avatar.tsx` | `apps/web/src/components/ui/Avatar.tsx` |
| `host-reference/web/src/components/ui/Badge.tsx` | `apps/web/src/components/ui/Badge.tsx` |
| `host-reference/web/src/components/ui/Button.tsx` | `apps/web/src/components/ui/Button.tsx` |
| `host-reference/web/src/components/ui/Card.tsx` | `apps/web/src/components/ui/Card.tsx` |
| `host-reference/web/src/components/ui/Checkbox.tsx` | `apps/web/src/components/ui/Checkbox.tsx` |
| `host-reference/web/src/components/ui/Combobox.tsx` | `apps/web/src/components/ui/Combobox.tsx` |
| `host-reference/web/src/components/ui/DataTable.tsx` | `apps/web/src/components/ui/DataTable.tsx` |
| `host-reference/web/src/components/ui/DataTableEditableCell.tsx` | `apps/web/src/components/ui/DataTableEditableCell.tsx` |
| `host-reference/web/src/components/ui/DatePicker.tsx` | `apps/web/src/components/ui/DatePicker.tsx` |
| `host-reference/web/src/components/ui/DateRangePicker.tsx` | `apps/web/src/components/ui/DateRangePicker.tsx` |
| `host-reference/web/src/components/ui/Dialog.tsx` | `apps/web/src/components/ui/Dialog.tsx` |
| `host-reference/web/src/components/ui/Drawer.tsx` | `apps/web/src/components/ui/Drawer.tsx` |
| `host-reference/web/src/components/ui/EmptyState.tsx` | `apps/web/src/components/ui/EmptyState.tsx` |
| `host-reference/web/src/components/ui/Eyebrow.tsx` | `apps/web/src/components/ui/Eyebrow.tsx` |
| `host-reference/web/src/components/ui/FilterBar.tsx` | `apps/web/src/components/ui/FilterBar.tsx` |
| `host-reference/web/src/components/ui/FormSection.tsx` | `apps/web/src/components/ui/FormSection.tsx` |
| `host-reference/web/src/components/ui/IconButton.tsx` | `apps/web/src/components/ui/IconButton.tsx` |
| `host-reference/web/src/components/ui/Input.tsx` | `apps/web/src/components/ui/Input.tsx` |
| `host-reference/web/src/components/ui/Menu.tsx` | `apps/web/src/components/ui/Menu.tsx` |
| `host-reference/web/src/components/ui/PageChrome.tsx` | `apps/web/src/components/ui/PageChrome.tsx` |
| `host-reference/web/src/components/ui/PageHeader.tsx` | `apps/web/src/components/ui/PageHeader.tsx` |
| `host-reference/web/src/components/ui/PageShell.tsx` | `apps/web/src/components/ui/PageShell.tsx` |
| `host-reference/web/src/components/ui/Popover.tsx` | `apps/web/src/components/ui/Popover.tsx` |
| `host-reference/web/src/components/ui/Segmented.tsx` | `apps/web/src/components/ui/Segmented.tsx` |
| `host-reference/web/src/components/ui/Skeleton.tsx` | `apps/web/src/components/ui/Skeleton.tsx` |
| `host-reference/web/src/components/ui/StageBadge.tsx` | `apps/web/src/components/ui/StageBadge.tsx` |
| `host-reference/web/src/components/ui/StickyFormBar.tsx` | `apps/web/src/components/ui/StickyFormBar.tsx` |
| `host-reference/web/src/components/ui/Tabs.tsx` | `apps/web/src/components/ui/Tabs.tsx` |
| `host-reference/web/src/components/ui/TagsInput.tsx` | `apps/web/src/components/ui/TagsInput.tsx` |
| `host-reference/web/src/components/ui/Toast.tsx` | `apps/web/src/components/ui/Toast.tsx` |
| `host-reference/web/src/components/ui/Tooltip.tsx` | `apps/web/src/components/ui/Tooltip.tsx` |
| `host-reference/web/src/components/ui/UrlTabs.tsx` | `apps/web/src/components/ui/UrlTabs.tsx` |
| `host-reference/web/src/components/ui/index.ts` | `apps/web/src/components/ui/index.ts` |
| `host-reference/web/src/components/ui/select/Listbox.tsx` | `apps/web/src/components/ui/select/Listbox.tsx` |
| `host-reference/web/src/components/ui/select/MultiSelect.tsx` | `apps/web/src/components/ui/select/MultiSelect.tsx` |
| `host-reference/web/src/components/ui/select/Select.tsx` | `apps/web/src/components/ui/select/Select.tsx` |
| `host-reference/web/src/components/ui/select/floating.tsx` | `apps/web/src/components/ui/select/floating.tsx` |
| `host-reference/web/src/components/ui/select/parts.tsx` | `apps/web/src/components/ui/select/parts.tsx` |
| `host-reference/web/src/components/ui/select/recents.ts` | `apps/web/src/components/ui/select/recents.ts` |
| `host-reference/web/src/lib/action-result.ts` | `apps/web/src/lib/action-result.ts` |
| `host-reference/web/src/lib/agenda-schedule.ts` | `apps/web/src/lib/agenda-schedule.ts` |
| `host-reference/web/src/lib/api.ts` | `apps/web/src/lib/api.ts` |
| `host-reference/web/src/lib/cn.ts` | `apps/web/src/lib/cn.ts` |
| `host-reference/web/src/lib/oauth.ts` | `apps/web/src/lib/oauth.ts` |
| `host-reference/web/src/lib/page-chrome.ts` | `apps/web/src/lib/page-chrome.ts` |
| `host-reference/web/src/lib/session.ts` | `apps/web/src/lib/session.ts` |
| `host-reference/web/src/lib/useFocusTrap.ts` | `apps/web/src/lib/useFocusTrap.ts` |
| `host-reference/web/src/lib/view-transition.ts` | `apps/web/src/lib/view-transition.ts` |
| `host-reference/web/src/middleware.ts` | `apps/web/src/middleware.ts` |

## `mcp`

| Neste repositório | Origem |
|---|---|
| `mcp/src/tools/content-images.ts` | `apps/mcp/src/tools/content-images.ts` |
| `mcp/src/tools/content.ts` | `apps/mcp/src/tools/content.ts` |
| `mcp/src/tools/social.ts` | `apps/mcp/src/tools/social.ts` |

## `modules`

| Neste repositório | Origem |
|---|---|
| `modules/content/package.json` | `modules/content/package.json` |
| `modules/content/src/assets.ts` | `modules/content/src/assets.ts` |
| `modules/content/src/blocks.test.ts` | `modules/content/src/blocks.test.ts` |
| `modules/content/src/blocks.ts` | `modules/content/src/blocks.ts` |
| `modules/content/src/events.db.test.ts` | `modules/content/src/events.db.test.ts` |
| `modules/content/src/images/download.test.ts` | `modules/content/src/images/download.test.ts` |
| `modules/content/src/images/download.ts` | `modules/content/src/images/download.ts` |
| `modules/content/src/images/service.test.ts` | `modules/content/src/images/service.test.ts` |
| `modules/content/src/images/service.ts` | `modules/content/src/images/service.ts` |
| `modules/content/src/images/templates.test.ts` | `modules/content/src/images/templates.test.ts` |
| `modules/content/src/images/templates.ts` | `modules/content/src/images/templates.ts` |
| `modules/content/src/index.ts` | `modules/content/src/index.ts` |
| `modules/content/src/media-kinds.ts` | `modules/content/src/media-kinds.ts` |
| `modules/content/src/posts.ts` | `modules/content/src/posts.ts` |
| `modules/content/src/preview-token.ts` | `modules/content/src/preview-token.ts` |
| `modules/content/src/public.ts` | `modules/content/src/public.ts` |
| `modules/content/src/revalidate.ts` | `modules/content/src/revalidate.ts` |
| `modules/content/src/schedule.ts` | `modules/content/src/schedule.ts` |
| `modules/content/src/video/import.ts` | `modules/content/src/video/import.ts` |
| `modules/content/src/video/probe.test.ts` | `modules/content/src/video/probe.test.ts` |
| `modules/content/src/video/probe.ts` | `modules/content/src/video/probe.ts` |
| `modules/content/tsconfig.json` | `modules/content/tsconfig.json` |
| `modules/social/package.json` | `modules/social/package.json` |
| `modules/social/src/access-rules.test.ts` | `modules/social/src/access-rules.test.ts` |
| `modules/social/src/access-rules.ts` | `modules/social/src/access-rules.ts` |
| `modules/social/src/access.db.test.ts` | `modules/social/src/access.db.test.ts` |
| `modules/social/src/access.ts` | `modules/social/src/access.ts` |
| `modules/social/src/accounts.ts` | `modules/social/src/accounts.ts` |
| `modules/social/src/index.ts` | `modules/social/src/index.ts` |
| `modules/social/src/instagram-connect.ts` | `modules/social/src/instagram-connect.ts` |
| `modules/social/src/linkedin-connect.ts` | `modules/social/src/linkedin-connect.ts` |
| `modules/social/src/linkedin-pages.test.ts` | `modules/social/src/linkedin-pages.test.ts` |
| `modules/social/src/linkedin-pages.ts` | `modules/social/src/linkedin-pages.ts` |
| `modules/social/src/linkedin-refresh.ts` | `modules/social/src/linkedin-refresh.ts` |
| `modules/social/src/metrics/adapters.test.ts` | `modules/social/src/metrics/adapters.test.ts` |
| `modules/social/src/metrics/agent.test.ts` | `modules/social/src/metrics/agent.test.ts` |
| `modules/social/src/metrics/agent.ts` | `modules/social/src/metrics/agent.ts` |
| `modules/social/src/metrics/analyze.test.ts` | `modules/social/src/metrics/analyze.test.ts` |
| `modules/social/src/metrics/analyze.ts` | `modules/social/src/metrics/analyze.ts` |
| `modules/social/src/metrics/collect.ts` | `modules/social/src/metrics/collect.ts` |
| `modules/social/src/metrics/engagement.test.ts` | `modules/social/src/metrics/engagement.test.ts` |
| `modules/social/src/metrics/engagement.ts` | `modules/social/src/metrics/engagement.ts` |
| `modules/social/src/metrics/import.ts` | `modules/social/src/metrics/import.ts` |
| `modules/social/src/metrics/instagram.ts` | `modules/social/src/metrics/instagram.ts` |
| `modules/social/src/metrics/linkedin.ts` | `modules/social/src/metrics/linkedin.ts` |
| `modules/social/src/metrics/report.ts` | `modules/social/src/metrics/report.ts` |
| `modules/social/src/metrics/types.ts` | `modules/social/src/metrics/types.ts` |
| `modules/social/src/posts.ts` | `modules/social/src/posts.ts` |
| `modules/social/src/providers/index.ts` | `modules/social/src/providers/index.ts` |
| `modules/social/src/providers/instagram.test.ts` | `modules/social/src/providers/instagram.test.ts` |
| `modules/social/src/providers/instagram.ts` | `modules/social/src/providers/instagram.ts` |
| `modules/social/src/providers/linkedin-pdf.test.ts` | `modules/social/src/providers/linkedin-pdf.test.ts` |
| `modules/social/src/providers/linkedin-pdf.ts` | `modules/social/src/providers/linkedin-pdf.ts` |
| `modules/social/src/providers/linkedin-text.test.ts` | `modules/social/src/providers/linkedin-text.test.ts` |
| `modules/social/src/providers/linkedin-text.ts` | `modules/social/src/providers/linkedin-text.ts` |
| `modules/social/src/providers/linkedin-video.test.ts` | `modules/social/src/providers/linkedin-video.test.ts` |
| `modules/social/src/providers/linkedin.test.ts` | `modules/social/src/providers/linkedin.test.ts` |
| `modules/social/src/providers/linkedin.ts` | `modules/social/src/providers/linkedin.ts` |
| `modules/social/src/providers/simulated.ts` | `modules/social/src/providers/simulated.ts` |
| `modules/social/src/providers/types.ts` | `modules/social/src/providers/types.ts` |
| `modules/social/src/publish.ts` | `modules/social/src/publish.ts` |
| `modules/social/src/remote.ts` | `modules/social/src/remote.ts` |
| `modules/social/src/rules.test.ts` | `modules/social/src/rules.test.ts` |
| `modules/social/src/rules.ts` | `modules/social/src/rules.ts` |
| `modules/social/src/schedule.ts` | `modules/social/src/schedule.ts` |
| `modules/social/src/social.db.test.ts` | `modules/social/src/social.db.test.ts` |
| `modules/social/src/status.test.ts` | `modules/social/src/status.test.ts` |
| `modules/social/src/status.ts` | `modules/social/src/status.ts` |
| `modules/social/src/sync/media-store.ts` | `modules/social/src/sync/media-store.ts` |
| `modules/social/src/sync/remote-posts.test.ts` | `modules/social/src/sync/remote-posts.test.ts` |
| `modules/social/src/sync/remote-posts.ts` | `modules/social/src/sync/remote-posts.ts` |
| `modules/social/src/utm.test.ts` | `modules/social/src/utm.test.ts` |
| `modules/social/src/utm.ts` | `modules/social/src/utm.ts` |
| `modules/social/tsconfig.json` | `modules/social/tsconfig.json` |

## `packages`

| Neste repositório | Origem |
|---|---|
| `packages/content-contract/package.json` | `packages/content-contract/package.json` |
| `packages/content-contract/src/blocks.test.ts` | `packages/content-contract/src/blocks.test.ts` |
| `packages/content-contract/src/blocks.ts` | `packages/content-contract/src/blocks.ts` |
| `packages/content-contract/src/index.ts` | `packages/content-contract/src/index.ts` |
| `packages/content-contract/tsconfig.json` | `packages/content-contract/tsconfig.json` |

## `prisma`

| Neste repositório | Origem |
|---|---|
| `prisma/host-required.prisma` | (novo — escrito para esta extração) |
| `prisma/migration-consolidada.sql` | (novo — escrito para esta extração) |
| `prisma/migrations-originais/20260813210000_content_posts/migration.sql` | `packages/db/prisma/migrations/20260813210000_content_posts/migration.sql` |
| `prisma/migrations-originais/20260813221547_content_post_scheduled_at/migration.sql` | `packages/db/prisma/migrations/20260813221547_content_post_scheduled_at/migration.sql` |
| `prisma/migrations-originais/20260813222500_content_post_published_content_updated_at/migration.sql` | `packages/db/prisma/migrations/20260813222500_content_post_published_content_updated_at/migration.sql` |
| `prisma/migrations-originais/20261010160000_social_posts/migration.sql` | `packages/db/prisma/migrations/20261010160000_social_posts/migration.sql` |
| `prisma/migrations-originais/20261013150000_social_analytics/down.sql` | `packages/db/prisma/migrations/20261013150000_social_analytics/down.sql` |
| `prisma/migrations-originais/20261013150000_social_analytics/migration.sql` | `packages/db/prisma/migrations/20261013150000_social_analytics/migration.sql` |
| `prisma/migrations-originais/20261014090000_content_asset_video/migration.sql` | `packages/db/prisma/migrations/20261014090000_content_asset_video/migration.sql` |
| `prisma/migrations-originais/20261014150000_social_import_posts/migration.sql` | excerto de packages/db/prisma/migrations/20261014150000_ads_optimization_conversions/migration.sql |
| `prisma/migrations-originais/20261014210000_social_accounts_per_user/down.sql` | `packages/db/prisma/migrations/20261014210000_social_accounts_per_user/down.sql` |
| `prisma/migrations-originais/20261014210000_social_accounts_per_user/migration.sql` | `packages/db/prisma/migrations/20261014210000_social_accounts_per_user/migration.sql` |
| `prisma/migrations-originais/20261015090000_social_post_placement/down.sql` | `packages/db/prisma/migrations/20261015090000_social_post_placement/down.sql` |
| `prisma/migrations-originais/20261015090000_social_post_placement/migration.sql` | `packages/db/prisma/migrations/20261015090000_social_post_placement/migration.sql` |
| `prisma/social-content.prisma` | blocos copiados de packages/db/prisma/schema.prisma |

## `web`

| Neste repositório | Origem |
|---|---|
| `web/assets/fonts/IBMPlexMono-Regular.ttf` | `apps/web/assets/fonts/IBMPlexMono-Regular.ttf` |
| `web/assets/fonts/IBMPlexSans-Light.ttf` | `apps/web/assets/fonts/IBMPlexSans-Light.ttf` |
| `web/assets/fonts/IBMPlexSans-Regular.ttf` | `apps/web/assets/fonts/IBMPlexSans-Regular.ttf` |
| `web/assets/fonts/IBMPlexSans-SemiBold.ttf` | `apps/web/assets/fonts/IBMPlexSans-SemiBold.ttf` |
| `web/assets/fonts/Inter-Regular.woff` | `apps/web/assets/fonts/Inter-Regular.woff` |
| `web/assets/fonts/Inter-SemiBold.woff` | `apps/web/assets/fonts/Inter-SemiBold.woff` |
| `web/assets/fonts/README.md` | `apps/web/assets/fonts/README.md` |
| `web/public/conteudo-midia/foto-camadas-dados.jpg` | `apps/web/public/conteudo-midia/foto-camadas-dados.jpg` |
| `web/public/conteudo-midia/foto-macbook-site-banner.jpg` | `apps/web/public/conteudo-midia/foto-macbook-site-banner.jpg` |
| `web/public/conteudo-midia/foto-macbook-site-pedra.jpg` | `apps/web/public/conteudo-midia/foto-macbook-site-pedra.jpg` |
| `web/public/conteudo-midia/foto-notebook-painel.jpg` | `apps/web/public/conteudo-midia/foto-notebook-painel.jpg` |
| `web/public/conteudo-midia/foto-notebook-site.jpg` | `apps/web/public/conteudo-midia/foto-notebook-site.jpg` |
| `web/public/conteudo-midia/foto-notebook-vendas.jpg` | `apps/web/public/conteudo-midia/foto-notebook-vendas.jpg` |
| `web/public/conteudo-midia/foto-tablet-relatorio.jpg` | `apps/web/public/conteudo-midia/foto-tablet-relatorio.jpg` |
| `web/public/conteudo-midia/logo-branco-mono.png` | `apps/web/public/conteudo-midia/logo-branco-mono.png` |
| `web/public/conteudo-midia/logo-branco.png` | `apps/web/public/conteudo-midia/logo-branco.png` |
| `web/public/conteudo-midia/logo-preto-mono.png` | `apps/web/public/conteudo-midia/logo-preto-mono.png` |
| `web/public/conteudo-midia/logo-preto.png` | `apps/web/public/conteudo-midia/logo-preto.png` |
| `web/public/conteudo-midia/miniaturas/foto-camadas-dados.jpg` | `apps/web/public/conteudo-midia/miniaturas/foto-camadas-dados.jpg` |
| `web/public/conteudo-midia/miniaturas/foto-macbook-site-banner.jpg` | `apps/web/public/conteudo-midia/miniaturas/foto-macbook-site-banner.jpg` |
| `web/public/conteudo-midia/miniaturas/foto-macbook-site-pedra.jpg` | `apps/web/public/conteudo-midia/miniaturas/foto-macbook-site-pedra.jpg` |
| `web/public/conteudo-midia/miniaturas/foto-notebook-painel.jpg` | `apps/web/public/conteudo-midia/miniaturas/foto-notebook-painel.jpg` |
| `web/public/conteudo-midia/miniaturas/foto-notebook-site.jpg` | `apps/web/public/conteudo-midia/miniaturas/foto-notebook-site.jpg` |
| `web/public/conteudo-midia/miniaturas/foto-notebook-vendas.jpg` | `apps/web/public/conteudo-midia/miniaturas/foto-notebook-vendas.jpg` |
| `web/public/conteudo-midia/miniaturas/foto-tablet-relatorio.jpg` | `apps/web/public/conteudo-midia/miniaturas/foto-tablet-relatorio.jpg` |
| `web/public/conteudo-midia/miniaturas/mockup-celular-diagnostico.jpg` | `apps/web/public/conteudo-midia/miniaturas/mockup-celular-diagnostico.jpg` |
| `web/public/conteudo-midia/miniaturas/mockup-notebook-site.jpg` | `apps/web/public/conteudo-midia/miniaturas/mockup-notebook-site.jpg` |
| `web/public/conteudo-midia/miniaturas/mockup-tablet-dashboard.jpg` | `apps/web/public/conteudo-midia/miniaturas/mockup-tablet-dashboard.jpg` |
| `web/public/conteudo-midia/miniaturas/print-fluxo-caixa.jpg` | `apps/web/public/conteudo-midia/miniaturas/print-fluxo-caixa.jpg` |
| `web/public/conteudo-midia/miniaturas/print-painel-financeiro.jpg` | `apps/web/public/conteudo-midia/miniaturas/print-painel-financeiro.jpg` |
| `web/public/conteudo-midia/miniaturas/print-painel-vendas.jpg` | `apps/web/public/conteudo-midia/miniaturas/print-painel-vendas.jpg` |
| `web/public/conteudo-midia/miniaturas/print-projecao-lucro.jpg` | `apps/web/public/conteudo-midia/miniaturas/print-projecao-lucro.jpg` |
| `web/public/conteudo-midia/mockup-celular-diagnostico.png` | `apps/web/public/conteudo-midia/mockup-celular-diagnostico.png` |
| `web/public/conteudo-midia/mockup-notebook-site.png` | `apps/web/public/conteudo-midia/mockup-notebook-site.png` |
| `web/public/conteudo-midia/mockup-tablet-dashboard.png` | `apps/web/public/conteudo-midia/mockup-tablet-dashboard.png` |
| `web/public/conteudo-midia/print-fluxo-caixa.jpg` | `apps/web/public/conteudo-midia/print-fluxo-caixa.jpg` |
| `web/public/conteudo-midia/print-painel-financeiro.jpg` | `apps/web/public/conteudo-midia/print-painel-financeiro.jpg` |
| `web/public/conteudo-midia/print-painel-vendas.jpg` | `apps/web/public/conteudo-midia/print-painel-vendas.jpg` |
| `web/public/conteudo-midia/print-projecao-lucro.jpg` | `apps/web/public/conteudo-midia/print-projecao-lucro.jpg` |
| `web/src/app/(app)/conteudo/[id]/loading.tsx` | `apps/web/src/app/(app)/conteudo/[id]/loading.tsx` |
| `web/src/app/(app)/conteudo/[id]/page.tsx` | `apps/web/src/app/(app)/conteudo/[id]/page.tsx` |
| `web/src/app/(app)/conteudo/actions.ts` | `apps/web/src/app/(app)/conteudo/actions.ts` |
| `web/src/app/(app)/conteudo/imagens/ImageGenerator.tsx` | `apps/web/src/app/(app)/conteudo/imagens/ImageGenerator.tsx` |
| `web/src/app/(app)/conteudo/imagens/TemplateField.tsx` | `apps/web/src/app/(app)/conteudo/imagens/TemplateField.tsx` |
| `web/src/app/(app)/conteudo/imagens/loading.tsx` | `apps/web/src/app/(app)/conteudo/imagens/loading.tsx` |
| `web/src/app/(app)/conteudo/imagens/page.tsx` | `apps/web/src/app/(app)/conteudo/imagens/page.tsx` |
| `web/src/app/(app)/conteudo/loading.tsx` | `apps/web/src/app/(app)/conteudo/loading.tsx` |
| `web/src/app/(app)/conteudo/page.tsx` | `apps/web/src/app/(app)/conteudo/page.tsx` |
| `web/src/app/(app)/settings/social/SocialAccessDrawer.tsx` | `apps/web/src/app/(app)/settings/social/SocialAccessDrawer.tsx` |
| `web/src/app/(app)/settings/social/SocialAccountRow.tsx` | `apps/web/src/app/(app)/settings/social/SocialAccountRow.tsx` |
| `web/src/app/(app)/settings/social/SocialAccountsList.tsx` | `apps/web/src/app/(app)/settings/social/SocialAccountsList.tsx` |
| `web/src/app/(app)/settings/social/page.tsx` | `apps/web/src/app/(app)/settings/social/page.tsx` |
| `web/src/app/(app)/social/[id]/page.tsx` | `apps/web/src/app/(app)/social/[id]/page.tsx` |
| `web/src/app/(app)/social/account-actions.ts` | `apps/web/src/app/(app)/social/account-actions.ts` |
| `web/src/app/(app)/social/actions.ts` | `apps/web/src/app/(app)/social/actions.ts` |
| `web/src/app/(app)/social/desempenho/loading.tsx` | `apps/web/src/app/(app)/social/desempenho/loading.tsx` |
| `web/src/app/(app)/social/desempenho/page.tsx` | `apps/web/src/app/(app)/social/desempenho/page.tsx` |
| `web/src/app/(app)/social/loading.tsx` | `apps/web/src/app/(app)/social/loading.tsx` |
| `web/src/app/(app)/social/novo/page.tsx` | `apps/web/src/app/(app)/social/novo/page.tsx` |
| `web/src/app/(app)/social/page.tsx` | `apps/web/src/app/(app)/social/page.tsx` |
| `web/src/app/api/content/assets/import-video/route.ts` | `apps/web/src/app/api/content/assets/import-video/route.ts` |
| `web/src/app/api/content/assets/import/route.ts` | `apps/web/src/app/api/content/assets/import/route.ts` |
| `web/src/app/api/content/assets/preview/route.ts` | `apps/web/src/app/api/content/assets/preview/route.ts` |
| `web/src/app/api/content/assets/register-video/route.ts` | `apps/web/src/app/api/content/assets/register-video/route.ts` |
| `web/src/app/api/content/assets/render/route.ts` | `apps/web/src/app/api/content/assets/render/route.ts` |
| `web/src/app/api/content/assets/upload/route.ts` | `apps/web/src/app/api/content/assets/upload/route.ts` |
| `web/src/app/api/content/posts/[slug]/route.ts` | `apps/web/src/app/api/content/posts/[slug]/route.ts` |
| `web/src/app/api/content/posts/route.ts` | `apps/web/src/app/api/content/posts/route.ts` |
| `web/src/app/api/content/preview/[id]/route.ts` | `apps/web/src/app/api/content/preview/[id]/route.ts` |
| `web/src/app/api/cron/publish-scheduled/route.ts` | `apps/web/src/app/api/cron/publish-scheduled/route.ts` |
| `web/src/app/api/cron/publish-social/route.ts` | `apps/web/src/app/api/cron/publish-social/route.ts` |
| `web/src/app/api/cron/social-metrics/route.ts` | `apps/web/src/app/api/cron/social-metrics/route.ts` |
| `web/src/app/api/social/instagram/callback/route.ts` | `apps/web/src/app/api/social/instagram/callback/route.ts` |
| `web/src/app/api/social/instagram/connect/route.ts` | `apps/web/src/app/api/social/instagram/connect/route.ts` |
| `web/src/app/api/social/linkedin/callback/route.ts` | `apps/web/src/app/api/social/linkedin/callback/route.ts` |
| `web/src/app/api/social/linkedin/connect/route.ts` | `apps/web/src/app/api/social/linkedin/connect/route.ts` |
| `web/src/components/content/BulkContentStatusButtons.tsx` | `apps/web/src/components/content/BulkContentStatusButtons.tsx` |
| `web/src/components/content/BulkSetCategoryButton.tsx` | `apps/web/src/components/content/BulkSetCategoryButton.tsx` |
| `web/src/components/content/CategoryFilter.tsx` | `apps/web/src/components/content/CategoryFilter.tsx` |
| `web/src/components/content/ContentRowActionsMenu.tsx` | `apps/web/src/components/content/ContentRowActionsMenu.tsx` |
| `web/src/components/content/MediaPicker.tsx` | `apps/web/src/components/content/MediaPicker.tsx` |
| `web/src/components/content/MediaPickerItem.tsx` | `apps/web/src/components/content/MediaPickerItem.tsx` |
| `web/src/components/content/MediaThumb.tsx` | `apps/web/src/components/content/MediaThumb.tsx` |
| `web/src/components/content/NewPostMenu.tsx` | `apps/web/src/components/content/NewPostMenu.tsx` |
| `web/src/components/content/PostBodyEditor.tsx` | `apps/web/src/components/content/PostBodyEditor.tsx` |
| `web/src/components/content/PostEditor.tsx` | `apps/web/src/components/content/PostEditor.tsx` |
| `web/src/components/content/PostPreviewFrame.tsx` | `apps/web/src/components/content/PostPreviewFrame.tsx` |
| `web/src/components/content/PostSettingsDrawer.tsx` | `apps/web/src/components/content/PostSettingsDrawer.tsx` |
| `web/src/components/content/PublishControls.tsx` | `apps/web/src/components/content/PublishControls.tsx` |
| `web/src/components/content/StructurePanel.tsx` | `apps/web/src/components/content/StructurePanel.tsx` |
| `web/src/components/content/media-files.ts` | `apps/web/src/components/content/media-files.ts` |
| `web/src/components/content/meta.ts` | `apps/web/src/components/content/meta.ts` |
| `web/src/components/content/postForm.ts` | `apps/web/src/components/content/postForm.ts` |
| `web/src/components/content/structure.ts` | `apps/web/src/components/content/structure.ts` |
| `web/src/components/content/tiptap/BubbleMenuBar.tsx` | `apps/web/src/components/content/tiptap/BubbleMenuBar.tsx` |
| `web/src/components/content/tiptap/InsertControl.tsx` | `apps/web/src/components/content/tiptap/InsertControl.tsx` |
| `web/src/components/content/tiptap/SlashMenuList.tsx` | `apps/web/src/components/content/tiptap/SlashMenuList.tsx` |
| `web/src/components/content/tiptap/adapter.test.ts` | `apps/web/src/components/content/tiptap/adapter.test.ts` |
| `web/src/components/content/tiptap/adapter.ts` | `apps/web/src/components/content/tiptap/adapter.ts` |
| `web/src/components/content/tiptap/atomicBlocks.ts` | `apps/web/src/components/content/tiptap/atomicBlocks.ts` |
| `web/src/components/content/tiptap/columnsDragDrop.test.ts` | `apps/web/src/components/content/tiptap/columnsDragDrop.test.ts` |
| `web/src/components/content/tiptap/columnsDragDrop.ts` | `apps/web/src/components/content/tiptap/columnsDragDrop.ts` |
| `web/src/components/content/tiptap/containerNodes.tsx` | `apps/web/src/components/content/tiptap/containerNodes.tsx` |
| `web/src/components/content/tiptap/context.tsx` | `apps/web/src/components/content/tiptap/context.tsx` |
| `web/src/components/content/tiptap/nodeShared.tsx` | `apps/web/src/components/content/tiptap/nodeShared.tsx` |
| `web/src/components/content/tiptap/nodes.tsx` | `apps/web/src/components/content/tiptap/nodes.tsx` |
| `web/src/components/content/tiptap/nodesExtra.tsx` | `apps/web/src/components/content/tiptap/nodesExtra.tsx` |
| `web/src/components/content/tiptap/nodesText.tsx` | `apps/web/src/components/content/tiptap/nodesText.tsx` |
| `web/src/components/content/tiptap/richTextExtensions.ts` | `apps/web/src/components/content/tiptap/richTextExtensions.ts` |
| `web/src/components/content/tiptap/slashCommand.ts` | `apps/web/src/components/content/tiptap/slashCommand.ts` |
| `web/src/components/content/usePostAutosave.ts` | `apps/web/src/components/content/usePostAutosave.ts` |
| `web/src/components/social/AccountAvatar.tsx` | `apps/web/src/components/social/AccountAvatar.tsx` |
| `web/src/components/social/ComposerParts.tsx` | `apps/web/src/components/social/ComposerParts.tsx` |
| `web/src/components/social/ComposerVariantFields.tsx` | `apps/web/src/components/social/ComposerVariantFields.tsx` |
| `web/src/components/social/PostBits.tsx` | `apps/web/src/components/social/PostBits.tsx` |
| `web/src/components/social/PostDetail.tsx` | `apps/web/src/components/social/PostDetail.tsx` |
| `web/src/components/social/PostPromotionSection.tsx` | `apps/web/src/components/social/PostPromotionSection.tsx` |
| `web/src/components/social/SocialCalendar.tsx` | `apps/web/src/components/social/SocialCalendar.tsx` |
| `web/src/components/social/SocialComposer.tsx` | `apps/web/src/components/social/SocialComposer.tsx` |
| `web/src/components/social/SocialList.tsx` | `apps/web/src/components/social/SocialList.tsx` |
| `web/src/components/social/SocialPostActions.tsx` | `apps/web/src/components/social/SocialPostActions.tsx` |
| `web/src/components/social/SocialPreview.tsx` | `apps/web/src/components/social/SocialPreview.tsx` |
| `web/src/components/social/SocialWorkspace.tsx` | `apps/web/src/components/social/SocialWorkspace.tsx` |
| `web/src/components/social/format.ts` | `apps/web/src/components/social/format.ts` |
| `web/src/components/social/performance/BestTimes.tsx` | `apps/web/src/components/social/performance/BestTimes.tsx` |
| `web/src/components/social/performance/Breakdown.tsx` | `apps/web/src/components/social/performance/Breakdown.tsx` |
| `web/src/components/social/performance/CapabilityDialog.tsx` | `apps/web/src/components/social/performance/CapabilityDialog.tsx` |
| `web/src/components/social/performance/KpiStrip.tsx` | `apps/web/src/components/social/performance/KpiStrip.tsx` |
| `web/src/components/social/performance/PerformanceDashboard.tsx` | `apps/web/src/components/social/performance/PerformanceDashboard.tsx` |
| `web/src/components/social/performance/PostPerformanceDrawer.tsx` | `apps/web/src/components/social/performance/PostPerformanceDrawer.tsx` |
| `web/src/components/social/performance/PostsTable.tsx` | `apps/web/src/components/social/performance/PostsTable.tsx` |
| `web/src/components/social/performance/TrendChart.tsx` | `apps/web/src/components/social/performance/TrendChart.tsx` |
| `web/src/components/social/tabs.ts` | `apps/web/src/components/social/tabs.ts` |
| `web/src/components/social/types.test.ts` | `apps/web/src/components/social/types.test.ts` |
| `web/src/components/social/types.ts` | `apps/web/src/components/social/types.ts` |
| `web/src/lib/content-images/art-data.tsx` | `apps/web/src/lib/content-images/art-data.tsx` |
| `web/src/lib/content-images/art-media.tsx` | `apps/web/src/lib/content-images/art-media.tsx` |
| `web/src/lib/content-images/art-parts.tsx` | `apps/web/src/lib/content-images/art-parts.tsx` |
| `web/src/lib/content-images/art.tsx` | `apps/web/src/lib/content-images/art.tsx` |
| `web/src/lib/content-images/fonts.ts` | `apps/web/src/lib/content-images/fonts.ts` |
| `web/src/lib/content-images/index.ts` | `apps/web/src/lib/content-images/index.ts` |
| `web/src/lib/content-images/media.ts` | `apps/web/src/lib/content-images/media.ts` |
| `web/src/lib/content-images/render.test.ts` | `apps/web/src/lib/content-images/render.test.ts` |
| `web/src/lib/content-videos.ts` | `apps/web/src/lib/content-videos.ts` |
| `web/src/lib/social-media-store.ts` | `apps/web/src/lib/social-media-store.ts` |
| `web/src/lib/social-oauth.ts` | `apps/web/src/lib/social-oauth.ts` |
