# 07 — Configuração e variáveis de ambiente

Nenhum valor real está neste repositório. Os nomes abaixo são os que o código lê.

## Obrigatórias

| Variável | Quem lê | Para quê |
|---|---|---|
| `DATABASE_URL` (+ `DIRECT_URL` se houver pooler) | Prisma | Banco PostgreSQL. |
| `MAILBOX_ENC_KEY` | `secrets` do core | Chave de 32 bytes (base64) para cifrar os tokens das redes. O nome é histórico (nasceu para senhas de caixas de e-mail). **Se mudar ou se perder, todas as contas têm de ser religadas.** |
| `CRON_SECRET` | rotas de cron | `Authorization: Bearer $CRON_SECRET` nos pedidos do agendador. |
| `AUTH_URL` | `issuerUrl()` | URL pública da aplicação; base dos redirect URIs do OAuth (`<AUTH_URL>/api/social/<rede>/callback`). |
| `SOCIAL_PUBLISH` | `publishMode()` | `live` publica de verdade. **Qualquer outro valor (ou ausente) só simula.** |

## Redes sociais

| Variável | Para quê |
|---|---|
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | App do LinkedIn para perfis pessoais (OpenID + `w_member_social`). Sem elas o botão fica desativado com o motivo. |
| `LINKEDIN_PAGES_CLIENT_ID`, `LINKEDIN_PAGES_CLIENT_SECRET` | Opcional: app separado com a Community Management API, para Páginas. Sem elas, "Ligar Página" usa o app principal. |
| `LINKEDIN_API_VERSION` | Opcional: força a versão `YYYYMM` da API (padrão: dois meses atrás). |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | App da Meta com o produto "Instagram API with Instagram Login". |
| `INSTAGRAM_API_VERSION` | Opcional (padrão `v25.0`). |

Escopos pedidos (constantes no código): LinkedIn `openid profile w_member_social` (+ escopos de Página:
`w_organization_social`, `r_organization_social`, `rw_organization_admin`); Instagram
`instagram_business_basic`, `instagram_business_content_publish` (+ `instagram_business_manage_insights`
para métricas). Passo a passo de criação dos apps, produtos a pedir e o que cada permissão desbloqueia:
`docs/09-configurar-apps-linkedin-instagram.md`.

## Armazenamento de ficheiros (Vercel Blob no original)

| Variável | Para quê |
|---|---|
| `BLOB_STORE_ID` | Store público de conteúdo. Ligado por OIDC na Vercel (`VERCEL_OIDC_TOKEN` injetado em runtime). Sem ela, a prévia de imagens funciona, mas guardar/enviar explica o que falta. |
| `BLOB_WEBHOOK_PUBLIC_KEY` | Verificação do callback do upload direto (`handleUpload`). |
| `BLOB_READ_WRITE_TOKEN` | Alternativa fora da Vercel (token estático). |

Para trocar de armazenamento (S3, R2, GCS...), basta reimplementar: `storage.put` em
`web/src/lib/content-images/index.ts`, o `VideoStorage` usado por `import-video`, a cópia em
`web/src/lib/social-media-store.ts` e a rota de upload direto. Os módulos não mudam.
**Requisito:** as URLs têm de ser públicas — o Instagram baixa a imagem/vídeo a partir delas.

## Site externo (opcional, módulo de conteúdo)

| Variável | Para quê |
|---|---|
| `SITE_REVALIDATE_URL`, `SITE_REVALIDATE_SECRET` | Webhook chamado ao publicar/despublicar (`POST {kind, slug}` com Bearer). Sem elas, só um aviso no log. A origem da prévia também é derivada desta URL. |
| `SITE_PREVIEW_SECRET` | Assina o token de 15 min da prévia por iframe. |
| Token de API com escopo `content:read` | O site usa-o para ler `/api/content/posts`. É emitido pelo sistema de tokens do host. |

## Servidor MCP

| Variável | Para quê |
|---|---|
| `MCP_ACTOR_EMAIL` | Utilizador em nome de quem a sessão MCP stdio age (tem de existir e estar ativo). |
| `CRM_URL`, `CRM_API_TOKEN` | Só no MCP stdio, para as tools de imagem/vídeo chamarem a aplicação web (token com `content:write`). Na rota HTTP `/api/mcp` não são precisas. |

## Agendador

Configure três chamadas periódicas com `Authorization: Bearer $CRON_SECRET` (ver `docs/06`):
`/api/cron/publish-social` (1–5 min), `/api/cron/social-metrics` (1–3 h), `/api/cron/publish-scheduled` (5–15 min).
