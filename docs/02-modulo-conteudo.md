# 02 — Módulo de criação de conteúdo (`@app/content`)

Pasta: `modules/content` (+ `packages/content-contract`). Telas em `web/src/app/(app)/conteudo`.

## Responsabilidades

1. **Artigos e casos de sucesso** (`ContentPost`): rascunho → agendado → publicado → arquivado,
   corpo em blocos, SEO, capa, CTA, publicação para um site externo.
2. **Biblioteca de mídia** (`ContentAsset`): imagens e vídeos com dimensões, tamanho, tipo e texto
   alternativo obrigatório. É a mídia que o módulo de redes sociais publica.
3. **Gerador de imagens por modelos**: preenche um modelo da marca (capa, slide, número...) e grava
   o resultado como `ContentAsset`.
4. **Vídeo**: importação por URL ou registo de um upload direto, com medição do MP4 sem ffmpeg.

## Mapa dos ficheiros

| Ficheiro | Papel |
|---|---|
| `src/index.ts` | API pública do pacote (ver abaixo). |
| `src/posts.ts` | CRUD de `ContentPost`, `publishPost`/`unpublishPost`, `schedulePost`/`cancelSchedule`, `publishDueScheduled` (cron), `duplicatePost`, portões de publicação. |
| `src/blocks.ts` | Reexporta `@app/content-contract` e acrescenta `sanitizeRichText`/`sanitizeBlocks` (servidor, usa `sanitize-html`). |
| `src/assets.ts` | `listContentAssets`, `createContentAsset`, `getAssetsByIds`, `updateContentAsset` (alt), `deleteContentAsset`, `contentStorage`. |
| `src/public.ts` | Leitura para o site: `listPublishedPosts`, `getPublishedPostBySlug`, `getPreviewPost`. |
| `src/revalidate.ts` | `notifySiteRevalidate` — avisa o site (webhook) para revalidar a rota do post. Nunca lança. |
| `src/preview-token.ts` | Token HMAC de 15 min para a prévia do post no site (iframe). |
| `src/schedule.ts` | `listScheduledContentPosts` — itens para a agenda do host (opcional). |
| `src/media-kinds.ts` | **Puro** (`@app/content/media`): tipos aceites, teto de vídeo, `assetKind`. |
| `src/images/templates.ts` | **Puro** (`@app/content/image-templates`): catálogo de modelos, campos, limites, paleta, catálogo de mídia da marca. |
| `src/images/service.ts` | `previewContentImage`, `renderContentImage`, `importContentImage` (recebem os adaptadores). |
| `src/images/download.ts` | `downloadImage` seguro (só http(s) público, verifica a cada redirect, teto de bytes, tipo pelos bytes). |
| `src/video/probe.ts` | `probeMp4` — lê largura, altura, duração e rotação das caixas ISO BMFF (sem ffmpeg). |
| `src/video/import.ts` | `importContentVideo` (por URL) e `registerUploadedVideo` (upload direto já feito ao Blob). |

## API pública (`import ... from '@app/content'`)

```ts
export * from './blocks.js';                       // contentBlocksSchema, walkBlocks, imageAssetIdsIn, sanitizeBlocks...
export * as posts from './posts.js';
export * as assets from './assets.js';
export * as publicPosts from './public.js';
export { notifySiteRevalidate } from './revalidate.js';
export { signPreviewToken, verifyPreviewToken, buildPreviewUrl } from './preview-token.js';
export * as images from './images/service.js';
export * as videos from './video/import.js';
export { probeMp4, VideoProbeError } from './video/probe.js';
export * from './images/templates.js';
export { IMPORT_MAX_BYTES, downloadImage } from './images/download.js';
export { listScheduledContentPosts } from './schedule.js';
```

## Artigos (`ContentPost`)

- **Tipos**: `ARTICLE` (blog) e `CASE` (caso de sucesso). Um único espaço de `slug` para os dois.
- **Estados**: `DRAFT` → `SCHEDULED` → `PUBLISHED` → `ARCHIVED`. `publishPost` sem `ctx` é o cron.
- **Criação instantânea**: `createPost` aceita só `kind` + `title`; o resto é exigido na publicação.
- **Portões de publicação** (`checkPublishGates`, erro por campo, aplicados também ao agendar):
  descrição de SEO obrigatória e ≤ 160 caracteres; slug em kebab-case; capa obrigatória e que seja
  imagem; pelo menos um bloco; todo bloco `image` com alt; botões/galerias/tabelas completos;
  cliente identificado (`clienteExibicao`) exige `clienteAutorizou = true`.
- **Corpo em blocos** (`@app/content-contract`): folhas `richText`, `image`, `callout`, `stat`,
  `embed`, `divider`, `gallery`, `table`, `button`, `code`, `quote`, `toc`; contentores `columns`
  (2–4) e `accordion`, que só aceitam folhas. Use sempre `walkBlocks`/`imageAssetIdsIn` para
  percorrer (incluem conteúdo aninhado). HTML do `richText` é sanitizado no servidor.
- **Alterações não publicadas**: `contentUpdatedAt` vs `publishedContentUpdatedAt`.
- **Site externo**: o site lê `GET /api/content/posts` e `/api/content/posts/[slug]` (só `PUBLISHED`,
  token com escopo `content:read`) e recebe o webhook de revalidação. A prévia de rascunhos usa
  `GET /api/content/preview/[id]?token=...` com o token HMAC curto.
- **Eventos**: `content.published` e `content.unpublished` (via `events.emit` do host).

## Biblioteca de mídia (`ContentAsset`)

- Aceita `image/jpeg|png|webp|gif` e `video/mp4|quicktime` (`@app/content/media`). Vídeo até 200 MB.
- `width`, `height`, `bytes`, `mimeType` e `alt` são gravados na criação; vídeo também `durationMs`.
- **Upload pelo navegador**: a tela pede um token a `POST /api/content/assets/upload`
  (`@vercel/blob/client` `handleUpload`), o navegador envia o ficheiro direto ao Blob, mede-o e
  depois chama a server action `createContentAssetAction` para registar a linha.
- Vídeo nunca entra no blog (`publishPost` recusa vídeo como capa ou bloco).

## Gerador de imagens

Modelos (`IMAGE_TEMPLATES`), todos exportados em JPEG:

| id | Tamanho | Uso |
|---|---|---|
| `social-cover` | 1080×1350 | Capa de carrossel |
| `social-slide` | 1080×1350 | Slide com numeral e lista |
| `social-stat` | 1080×1350 | Número grande + legenda + fonte |
| `social-quote` | 1080×1350 | Citação |
| `social-mockup` | 1080×1350 | Mockup/print em destaque |
| `social-cta` | 1080×1350 | Chamada final com botão e endereço |
| `social-question` | 1080×1350 | Perguntas do dono (balões) |
| `social-number` | 1080×1350 | Cards de número |
| `blog-cover` | 1200×630 | Capa de artigo |

- Cada campo tem limite de caracteres validado no schema (erro por campo). Títulos aceitam
  `**negrito**`, `==marca-texto==` e `!!destaque carmim!!` (um de cada por campo).
- `theme` (`escuro`, `claro` = off-white, `branco`), `logo` (`colorida` por omissão, `mono` = só
  preta ou branca, para fundo em que a cor brigue).
- Campo `media`: um item do catálogo da marca (`BRAND_MEDIA` → `web/public/conteudo-midia`) ou o id
  de um `ContentAsset` (tratado como print, com `frame` `notebook`/`navegador`/`tablet`/`celular`/`nenhum`).
- Nomes antigos continuam aceites via `TEMPLATE_ALIASES` (`ig-quote`, `ig-stat`, `ig-carousel-slide`, `li-card`).

Fluxo:

```
renderContentImage(input, ctx, deps)
  ├─ valida o input contra o modelo (zod, erro por campo)
  ├─ resolve media (catálogo ou ContentAsset)
  ├─ deps.renderer.render(...)   → PNG/bytes   (web: next/og + fontes de web/assets/fonts)
  ├─ deps.codec.toJpeg(...)      → JPEG        (web: sharp)
  ├─ deps.storage.put(...)       → URL pública (web: Vercel Blob)
  └─ createContentAsset(...)     → linha com alt obrigatório
```

`previewContentImage` faz o mesmo sem gravar (a tela mostra a prévia ao vivo).
`importContentImage` baixa uma imagem por URL (`target: "social"` → JPEG até 1440 px; `blog` mantém formato).

Os adaptadores reais estão em `web/src/lib/content-images/` (`index.ts` monta `renderer`, `codec`
e `storage`; `art*.tsx` desenha cada modelo em JSX para o Satori; `fonts.ts` e `media.ts` leem
`web/assets/fonts` e `web/public/conteudo-midia` do disco — por isso o `next.config.mjs` original
tem `outputFileTracingIncludes` para `/api/content/assets/*` e `/api/mcp`).

> O Satori quebra com propriedades de estilo `undefined` ("reading 'trim'"): só passe a
> propriedade quando tiver valor (ver `Rich` em `art-parts.tsx`).

## Vídeo

- **Por URL** (`importContentVideo`): baixa com a mesma proteção das imagens, até 200 MB, mede com
  `probeMp4` e grava pelo `VideoStorage` recebido.
- **Upload direto** (`registerUploadedVideo`): o ficheiro já foi enviado ao Blob; a função só aceita
  URL do próprio store (`opts.blobHost`) e regista o asset.
- Não há conversão, corte nem geração de vídeo: o vídeo é feito fora e só publicado.

## Telas (camada web)

- `/conteudo` — lista com filtros (tipo, estado, categoria), ações em massa, "Novo".
- `/conteudo/[id]` — editor (Tiptap com blocos, painel de estrutura, definições em gaveta, autosave,
  prévia em iframe, publicar/agendar).
- `/conteudo/imagens` — gerador: escolhe modelo, preenche com contador, prévia ao vivo, alt, guardar.
- Componentes: `web/src/components/content/*` (`MediaPicker` também é usado pelo composer social).
