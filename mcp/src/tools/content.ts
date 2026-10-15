import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { posts, assets, contentBlocksSchema } from '@app/content';
import { ContentKind, ContentStatus } from '@app/db';
import { run, mcpCtx } from '../util.js';
import { registerContentImageTools } from './content-images.js';

// Reusa a MESMA instância de schema que `postCreateSchema.blocks` usa
// (modules/content/src/posts.ts) — construir um `z.array(contentBlockSchema)`
// separado aqui produziria um tipo estruturalmente igual mas nominalmente
// distinto para o TypeScript, e `posts.createPost(args, ctx)` recusaria o
// argumento com "two different types with this name exist, but they are
// unrelated".
const blocksInput = contentBlocksSchema.describe(
  'Corpo do post: lista ordenada de blocos. Tipicamente richText -> image -> richText -> callout -> ' +
    'richText — escreva o texto como prosa contínua dentro de cada richText.html (parágrafos <p>, ' +
    '<h2>/<h3>/<h4>, <ul>/<ol>/<li>, <blockquote>, <strong>/<em>, <a>), não um bloco por parágrafo. Nunca ' +
    'use <h1> (o H1 da página é o título do post). Além dos blocos básicos (richText/image/callout/stat/' +
    'embed/divider), também existem: gallery (2-12 imagens), table (rows de células {html}), button ' +
    '(CTA com label/href/variant), code (linguagem+código, texto puro), quote (citação de destaque, ' +
    'diferente de <blockquote> dentro de um richText), toc (sumário automático — sem campos) e dois ' +
    'blocos-contêiner de UM nível só (nunca aninhe um dentro do outro): columns (2-4 colunas, cada uma ' +
    'com span somando 12 no total e sua própria lista de blocos-folha) e accordion (itens com título + ' +
    'blocos-folha). embed aceita provider opcional (youtube/vimeo/loom/link) e ratio opcional.',
);

const kindInput = z.nativeEnum(ContentKind).describe('ARTICLE (artigo) ou CASE (caso de sucesso)');

export function registerContentTools(server: McpServer) {
  // Imagens (capa, peças de rede social) moram em arquivo próprio, mas são
  // parte do mesmo domínio de conteúdo.
  registerContentImageTools(server);

  server.registerTool(
    'list_posts',
    {
      description:
        'Lista posts de blog/casos de sucesso, com filtro por tipo (kind), status e busca textual. ' +
        'Use para ver o que já existe antes de criar um post novo, ou para achar rascunhos pendentes de revisão.',
      inputSchema: {
        kind: kindInput.optional(),
        status: z.nativeEnum(ContentStatus).optional(),
        q: z.string().optional(),
        skip: z.number().int().min(0).optional(),
        take: z.number().int().min(1).max(100).optional(),
      },
    },
    (args) => run(() => posts.listPosts(args)),
  );

  server.registerTool(
    'get_post',
    {
      description: 'Detalha um post, incluindo os blocos do corpo.',
      inputSchema: { id: z.string() },
    },
    ({ id }) => run(() => posts.getPost(id)),
  );

  server.registerTool(
    'create_post',
    {
      description:
        'Cria um post (artigo ou caso de sucesso) como rascunho (status DRAFT) — nunca publica direto. ' +
        'Deixa como rascunho de verdade no CRM, revisável na tela antes de ir para o ar. slug é opcional ' +
        '(gerado do título se ausente). coverAssetId precisa apontar para um ContentAsset já existente ' +
        '(ver list_content_assets, ou gere com render_content_image template "blog-cover" / importe com ' +
        'import_content_image) — sem capa o post não passa em publish_post.',
      inputSchema: {
        kind: kindInput,
        title: z.string(),
        excerpt: z.string().describe('Resumo curto, usado em listagens'),
        seoDescription: z.string().nullable().optional().describe('≤160 caracteres — exigido para publicar'),
        seoTitle: z.string().nullable().optional(),
        category: z.string(),
        accent: z.string().describe('Cor de destaque (nome da classe/token usado pelo site)'),
        slug: z.string().optional(),
        blocks: blocksInput.optional(),
        coverAssetId: z.string().nullable().optional(),
        ctaHeadline: z.string().nullable().optional(),
        ctaDescription: z.string().nullable().optional(),
        clienteExibicao: z
          .string()
          .nullable()
          .optional()
          .describe('Só kind: CASE. Preenchido = cliente identificado, exige clienteAutorizou=true para publicar.'),
        setor: z.string().nullable().optional().describe('Só kind: CASE'),
        clienteAutorizou: z
          .boolean()
          .optional()
          .describe('Confirmação explícita de autorização de uso do nome do cliente — nunca assuma true.'),
      },
    },
    ({ blocks, ...args }) =>
      run(async () => posts.createPost({ ...args, blocks: blocks ?? [] }, await mcpCtx())),
  );

  server.registerTool(
    'update_post',
    {
      description: 'Atualiza campos de um post existente (rascunho ou já publicado).',
      inputSchema: {
        id: z.string(),
        title: z.string().optional(),
        excerpt: z.string().optional(),
        seoDescription: z.string().nullable().optional(),
        seoTitle: z.string().nullable().optional(),
        category: z.string().optional(),
        accent: z.string().optional(),
        slug: z.string().optional(),
        blocks: blocksInput.optional(),
        coverAssetId: z.string().nullable().optional(),
        ctaHeadline: z.string().nullable().optional(),
        ctaDescription: z.string().nullable().optional(),
        clienteExibicao: z.string().nullable().optional(),
        setor: z.string().nullable().optional(),
        clienteAutorizou: z.boolean().optional(),
      },
    },
    ({ id, ...data }) => run(() => posts.updatePost(id, data)),
  );

  server.registerTool(
    'publish_post',
    {
      description:
        'Publica um post. Recusa com erro por campo se algo faltar (descrição de SEO, capa, slug fora ' +
        'de kebab-case, bloco de imagem sem alt, ou caso de sucesso com cliente identificado sem ' +
        'autorização marcada) — corrija e chame de novo.',
      inputSchema: { id: z.string() },
    },
    ({ id }) => run(async () => posts.publishPost(id, await mcpCtx())),
  );

  server.registerTool(
    'unpublish_post',
    {
      description: 'Despublica um post (status volta para ARCHIVED, some das rotas públicas do site).',
      inputSchema: { id: z.string() },
    },
    ({ id }) => run(async () => posts.unpublishPost(id, await mcpCtx())),
  );

  server.registerTool(
    'schedule_post',
    {
      description:
        'Agenda a publicação de um post para uma data/hora futura (status SCHEDULED). Roda as mesmas ' +
        'validações de publish_post na hora de agendar — recusa com erro por campo se algo faltar. Um ' +
        'cron publica automaticamente quando a data chega.',
      inputSchema: { id: z.string(), scheduledAt: z.string().datetime().describe('ISO 8601, no futuro') },
    },
    ({ id, scheduledAt }) => run(() => posts.schedulePost(id, new Date(scheduledAt))),
  );

  server.registerTool(
    'cancel_schedule',
    {
      description: 'Cancela o agendamento de um post (volta para DRAFT).',
      inputSchema: { id: z.string() },
    },
    ({ id }) => run(() => posts.cancelSchedule(id)),
  );

  server.registerTool(
    'list_content_assets',
    {
      description:
        'Lista imagens e vídeos já registrados na biblioteca de conteúdo, para reaproveitar entre posts. ' +
        'kind "image" para capa e blocos do blog (vídeo nunca entra no blog); kind "video" para posts de rede social ' +
        '(mimeType video/mp4, com width/height e durationMs).',
      inputSchema: {
        q: z.string().optional(),
        kind: z.enum(['image', 'video']).optional(),
        skip: z.number().int().min(0).optional(),
        take: z.number().int().min(1).max(100).optional(),
      },
    },
    (args) => run(() => assets.listContentAssets(args)),
  );
}
