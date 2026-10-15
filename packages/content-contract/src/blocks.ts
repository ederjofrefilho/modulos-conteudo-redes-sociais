import { z } from 'zod';

/**
 * Contrato de blocos do corpo de um post — fonte única de verdade consumida
 * por `modules/content` (servidor) e `apps/web` (editor, navegador). Zero
 * dependência de Prisma/`sanitize-html` de propósito: é isso que permite o
 * bundle do navegador importar este pacote direto, sem arrastar o Prisma
 * client (ver CLAUDE.md).
 *
 * Dois níveis, não recursão livre: um bloco-CONTÊINER (`columns`, `accordion`)
 * só pode conter blocos-FOLHA. "Sem coluna dentro de coluna" é garantido pela
 * própria forma do schema (`column.blocks: leafBlockSchema[]`), não por
 * convenção nem por um contador de profundidade em tempo de execução.
 *
 * Tolerância deliberada: os campos que representam CONTEÚDO que o autor ainda
 * não preencheu (texto de citação, legenda de imagem, id de asset) aceitam
 * string vazia aqui — é o que permite inserir um bloco pela barra "/" e só
 * preenchê-lo depois, sem o autosave falhar no meio do caminho. Completude é
 * responsabilidade de `checkPublishGates` (`modules/content/src/posts.ts`),
 * no momento de publicar — nunca deste schema.
 */

export const BLOCK_WIDTHS = ['content', 'wide', 'full'] as const;
export type BlockWidth = (typeof BLOCK_WIDTHS)[number];
/** @deprecated use `BLOCK_WIDTHS` — mantido para não quebrar imports existentes. */
export const IMAGE_WIDTHS = BLOCK_WIDTHS;

export const CALLOUT_VARIANTS = ['info', 'success', 'warning'] as const;
export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

export const EMBED_PROVIDERS = ['youtube', 'vimeo', 'loom', 'link'] as const;
export type EmbedProvider = (typeof EMBED_PROVIDERS)[number];

export const GALLERY_LAYOUTS = ['grid', 'carousel'] as const;
export type GalleryLayout = (typeof GALLERY_LAYOUTS)[number];

export const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost'] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export const BUTTON_ALIGNS = ['left', 'center', 'right'] as const;
export type ButtonAlign = (typeof BUTTON_ALIGNS)[number];

export const COLUMNS_STACK_BELOW = ['sm', 'md'] as const;
export type ColumnsStackBelow = (typeof COLUMNS_STACK_BELOW)[number];

function isSafeUrlLike(value: string, { allowMailto }: { allowMailto: boolean }): boolean {
  if (value === '') return true; // vazio é tolerado aqui — publishGate cobra presença quando importa
  if (value.startsWith('/')) return true; // caminho relativo interno
  try {
    const url = new URL(value);
    const allowed = allowMailto ? ['http:', 'https:', 'mailto:'] : ['http:', 'https:'];
    return allowed.includes(url.protocol);
  } catch {
    return false;
  }
}

/**
 * Link "clicável" (botão, CTA de banner): http(s), mailto ou caminho
 * relativo. Recusa `javascript:`/`data:`/qualquer outro esquema — estes
 * campos viram `href` renderizado sem revisão humana no site.
 */
export const safeHrefSchema = z
  .string()
  .trim()
  .refine((v) => isSafeUrlLike(v, { allowMailto: true }), 'Link inválido — use http(s), mailto ou um caminho começando com "/"');

/** URL de incorporação (vídeo/painel): só http(s) — nunca faz sentido `mailto:` num embed. */
export const safeEmbedUrlSchema = z
  .string()
  .trim()
  .refine((v) => isSafeUrlLike(v, { allowMailto: false }), 'URL inválida');

// --- Blocos-folha -----------------------------------------------------

const richTextBlockSchema = z.object({
  type: z.literal('richText'),
  html: z.string().trim().min(1, 'Bloco de texto vazio'),
});

const imageBlockSchema = z.object({
  type: z.literal('image'),
  assetId: z.string().default(''),
  caption: z.string().trim().optional(),
  width: z.enum(BLOCK_WIDTHS).default('content'),
});

const calloutBlockSchema = z.object({
  type: z.literal('callout'),
  variant: z.enum(CALLOUT_VARIANTS).default('info'),
  title: z.string().trim().optional(),
  text: z.string().trim().default(''),
  ctaLabel: z.string().trim().optional(),
  ctaHref: safeHrefSchema.optional(),
});

const statBlockSchema = z.object({
  type: z.literal('stat'),
  value: z.string().trim().default(''),
  label: z.string().trim().default(''),
});

const embedBlockSchema = z.object({
  type: z.literal('embed'),
  url: safeEmbedUrlSchema.default(''),
  caption: z.string().trim().optional(),
  provider: z.enum(EMBED_PROVIDERS).optional(),
  // Proporção livre ('16/9', '4/3', '1/1') — o site cai para 16/9 se ausente.
  ratio: z.string().trim().optional(),
});

const dividerBlockSchema = z.object({ type: z.literal('divider') });

const galleryBlockSchema = z.object({
  type: z.literal('gallery'),
  assetIds: z.array(z.string().min(1)).max(12).default([]),
  layout: z.enum(GALLERY_LAYOUTS).default('grid'),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  caption: z.string().trim().optional(),
  width: z.enum(BLOCK_WIDTHS).default('content'),
});

const tableCellSchema = z.object({ html: z.string().default('') });

const tableBlockSchema = z.object({
  type: z.literal('table'),
  head: z.boolean().default(true),
  rows: z.array(z.array(tableCellSchema)).default([]),
  width: z.enum(BLOCK_WIDTHS).default('content'),
});

const buttonBlockSchema = z.object({
  type: z.literal('button'),
  label: z.string().trim().default(''),
  href: safeHrefSchema.default(''),
  variant: z.enum(BUTTON_VARIANTS).default('primary'),
  align: z.enum(BUTTON_ALIGNS).default('left'),
});

const codeBlockSchema = z.object({
  type: z.literal('code'),
  language: z.string().trim().default(''),
  code: z.string().default(''),
});

const quoteBlockSchema = z.object({
  type: z.literal('quote'),
  text: z.string().trim().default(''),
  attribution: z.string().trim().optional(),
});

/** Sem campos — o site monta a lista a partir dos H2/H3/H4 do próprio post. */
const tocBlockSchema = z.object({ type: z.literal('toc') });

export const LEAF_BLOCK_TYPES = [
  'richText',
  'image',
  'callout',
  'stat',
  'embed',
  'divider',
  'gallery',
  'table',
  'button',
  'code',
  'quote',
  'toc',
] as const;
export type LeafBlockType = (typeof LEAF_BLOCK_TYPES)[number];

/**
 * NUNCA usar `.refine()`/`.superRefine()` num membro individual desta união:
 * `z.discriminatedUnion` precisa inspecionar `.shape` de cada membro para
 * saber por qual literal discriminar, e um wrapper de refine (ZodEffects)
 * esconde isso — quebra em runtime com "Cannot read properties of undefined
 * (reading 'type')" (verificado). Regras que cruzam campos (soma de larguras
 * de coluna, consistência de linhas de tabela) entram via `.superRefine` no
 * nível de `contentBlockSchema`, abaixo — nunca aqui.
 */
export const leafBlockSchema = z.discriminatedUnion('type', [
  richTextBlockSchema,
  imageBlockSchema,
  calloutBlockSchema,
  statBlockSchema,
  embedBlockSchema,
  dividerBlockSchema,
  galleryBlockSchema,
  tableBlockSchema,
  buttonBlockSchema,
  codeBlockSchema,
  quoteBlockSchema,
  tocBlockSchema,
]);

export type LeafBlock = z.infer<typeof leafBlockSchema>;
export type RichTextBlock = z.infer<typeof richTextBlockSchema>;
export type ImageBlock = z.infer<typeof imageBlockSchema>;
export type GalleryBlock = z.infer<typeof galleryBlockSchema>;
export type TableBlock = z.infer<typeof tableBlockSchema>;
export type TableCell = z.infer<typeof tableCellSchema>;
export type ButtonBlock = z.infer<typeof buttonBlockSchema>;

// --- Blocos-contêiner (um nível só, por construção) --------------------

const columnSchema = z.object({
  /** Largura em avos de 12 (`grid-column: span N`) — soma das colunas de um `columns` precisa dar 12, ver superRefine abaixo. */
  span: z.number().int().min(1).max(12),
  blocks: z.array(leafBlockSchema).default([]),
});
export type Column = z.infer<typeof columnSchema>;

const columnsBlockSchema = z.object({
  type: z.literal('columns'),
  width: z.enum(BLOCK_WIDTHS).default('content'),
  stackBelow: z.enum(COLUMNS_STACK_BELOW).default('md'),
  columns: z.array(columnSchema).min(2).max(4),
});
export type ColumnsBlock = z.infer<typeof columnsBlockSchema>;

const accordionItemSchema = z.object({
  title: z.string().trim().default(''),
  blocks: z.array(leafBlockSchema).default([]),
});
export type AccordionItem = z.infer<typeof accordionItemSchema>;

const accordionBlockSchema = z.object({
  type: z.literal('accordion'),
  items: z.array(accordionItemSchema).min(1),
});
export type AccordionBlock = z.infer<typeof accordionBlockSchema>;

export const CONTAINER_BLOCK_TYPES = ['columns', 'accordion'] as const;
export type ContainerBlockType = (typeof CONTAINER_BLOCK_TYPES)[number];

export const KNOWN_BLOCK_TYPES = [...LEAF_BLOCK_TYPES, ...CONTAINER_BLOCK_TYPES] as const;
export type BlockType = (typeof KNOWN_BLOCK_TYPES)[number];

/**
 * A união completa. Continua um `discriminatedUnion` de verdade (boas
 * mensagens de erro, `path` correto em blocos aninhados) — as regras que uma
 * união discriminada não consegue expressar por si (soma de larguras de
 * coluna = 12, linhas de tabela do mesmo tamanho) entram por um único
 * `.superRefine` por fora, nunca dentro de um membro.
 */
export const contentBlockSchema = z
  .discriminatedUnion('type', [
    richTextBlockSchema,
    imageBlockSchema,
    calloutBlockSchema,
    statBlockSchema,
    embedBlockSchema,
    dividerBlockSchema,
    galleryBlockSchema,
    tableBlockSchema,
    buttonBlockSchema,
    codeBlockSchema,
    quoteBlockSchema,
    tocBlockSchema,
    columnsBlockSchema,
    accordionBlockSchema,
  ])
  .superRefine((block, ctx) => {
    if (block.type === 'columns') {
      const sum = block.columns.reduce((s, c) => s + c.span, 0);
      if (sum !== 12) {
        ctx.addIssue({ code: 'custom', message: 'A soma das larguras das colunas precisa dar 12.', path: ['columns'] });
      }
    }
    if (block.type === 'table' && block.rows.length > 0) {
      const width = block.rows[0]?.length ?? 0;
      const consistent = width > 0 && block.rows.every((r) => r.length === width);
      if (!consistent) {
        ctx.addIssue({ code: 'custom', message: 'Todas as linhas da tabela precisam ter o mesmo número de colunas.', path: ['rows'] });
      }
    }
  });

export type ContentBlock = z.infer<typeof contentBlockSchema>;
export const contentBlocksSchema = z.array(contentBlockSchema);

/** Sobe quando a FORMA da união muda de um jeito que um consumidor (site) precisa distinguir — ver `site/src/lib/content/blocks.ts`. */
export const CURRENT_BLOCKS_VERSION = 2;

// --- Travessia -----------------------------------------------------------

export type BlockPath = (string | number)[];

/**
 * Visita todo bloco-folha, inclusive dentro de `columns`/`accordion`. Base
 * única para qualquer operação que precise enxergar conteúdo aninhado —
 * sanitização, coleta de assetId, contagem de palavras, checklist de
 * publicação. Nunca escrever um `.map`/`.filter` direto sobre `blocks` de
 * novo: é exatamente esse padrão que ignorava conteúdo dentro de coluna.
 */
export function walkBlocks(blocks: ContentBlock[], visit: (block: ContentBlock, path: BlockPath) => void, path: BlockPath = []): void {
  blocks.forEach((block, index) => {
    const blockPath = [...path, index];
    visit(block, blockPath);
    if (block.type === 'columns') {
      block.columns.forEach((column, ci) => walkBlocks(column.blocks, visit, [...blockPath, 'columns', ci, 'blocks']));
    } else if (block.type === 'accordion') {
      block.items.forEach((item, ii) => walkBlocks(item.blocks, visit, [...blockPath, 'items', ii, 'blocks']));
    }
  });
}

/** Ids de `ContentAsset` referenciados em qualquer profundidade (`image` e `gallery`) — usado pela trava de alt na publicação e pela resolução pública de imagens. */
export function imageAssetIdsIn(blocks: ContentBlock[]): string[] {
  const ids: string[] = [];
  walkBlocks(blocks, (block) => {
    if (block.type === 'image' && block.assetId) ids.push(block.assetId);
    if (block.type === 'gallery') ids.push(...block.assetIds.filter(Boolean));
  });
  return ids;
}

// --- Fábrica de bloco vazio ------------------------------------------------

/**
 * Estado inicial ao inserir um bloco pela barra "/" ou pelo "+". Contêineres
 * nascem com a menor forma estruturalmente válida (2 colunas 6/6, 1 item de
 * acordeão) porque essas contagens são controladas pelo sistema, não digitadas
 * pelo autor — diferente do texto de um `quote` ou do `href` de um `button`,
 * que nascem vazios de propósito (ver nota de tolerância no topo do arquivo).
 */
export function emptyBlock(type: BlockType): ContentBlock {
  switch (type) {
    case 'richText':
      return { type, html: '' };
    case 'image':
      return { type, assetId: '', width: 'content' };
    case 'callout':
      return { type, variant: 'info', text: '' };
    case 'stat':
      return { type, value: '', label: '' };
    case 'embed':
      return { type, url: '' };
    case 'divider':
      return { type };
    case 'gallery':
      return { type, assetIds: [], layout: 'grid', columns: 3, width: 'content' };
    case 'table':
      return {
        type,
        head: true,
        rows: [
          [{ html: '' }, { html: '' }],
          [{ html: '' }, { html: '' }],
        ],
        width: 'content',
      };
    case 'button':
      return { type, label: '', href: '', variant: 'primary', align: 'left' };
    case 'code':
      return { type, language: '', code: '' };
    case 'quote':
      return { type, text: '' };
    case 'toc':
      return { type };
    case 'columns':
      return {
        type,
        width: 'content',
        stackBelow: 'md',
        columns: [
          { span: 6, blocks: [] },
          { span: 6, blocks: [] },
        ],
      };
    case 'accordion':
      return { type, items: [{ title: '', blocks: [] }] };
  }
}
