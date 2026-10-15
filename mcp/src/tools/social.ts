import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { socialAccounts, socialAgentMetrics, socialPosts } from '@app/social';
import { SocialPostStatus, SocialProvider } from '@app/db';
import { run, mcpCtx } from '../util.js';

// Redes sociais (docs/PLANO-REDES-SOCIAIS.md). O Claude cria, edita, agenda e
// lista. NÃO existe (e não deve existir) tool que aprove ou publique: isso é
// decisão humana, só na tela /social do CRM.

const textInput = z
  .string()
  .describe(
    'Texto final do post, pronto (quebras de linha com \\n). LinkedIn: até 3.000 caracteres. Instagram: legenda até ' +
      '2.200 caracteres, 30 hashtags e 20 menções. O feed corta em ~210 caracteres/3 linhas (LinkedIn) e ~125/2 linhas ' +
      '(Instagram) com "ver mais" — o gancho precisa estar antes disso.',
  );
const mediaInput = z
  .array(z.string())
  .describe(
    'Ids de ContentAsset, na ordem do carrossel (ver list_content_assets; gere com render_content_image template ' +
      'social-cover/social-slide/social-question/social-number..., ou importe com import_content_image target "social"). ' +
      'Instagram: 1 a 10 imagens JPEG, proporção 4:5 a 1,91:1. LinkedIn: 1 imagem, OU de 2 a 20 imagens JPG/PNG que ' +
      'o CRM publica como documento PDF (carrossel deslizável, prefira 1080x1350 iguais), OU um link com prévia ' +
      '(linkUrl), nunca imagem e link juntos. Vídeo: UM id de vídeo MP4 sozinho (list_content_assets kind "video"; ' +
      'o vídeo é feito fora do CRM e enviado pela tela, não há tool de envio). Instagram publica como Reels (9:16, ' +
      '3 s a 15 min); LinkedIn aceita 16:9 ou 9:16, 3 s a 30 min, sem link junto.',
  );

const placementInput = z
  .enum(['feed', 'reel', 'story'])
  .optional()
  .describe(
    'Só Instagram (LinkedIn é sempre feed). feed = imagem/carrossel com legenda; reel = 1 vídeo MP4 vertical 9:16, 3 s a 15 min; ' +
      'story = 1 imagem ou 1 vídeo de até 60 s, 9:16, fica 24 h, SEM legenda nem link (o texto vai na peça). Padrão: feed.',
  );

/** ISO → Date, preservando null (limpar) e undefined (não mexer). */
function toDate(value: string | null | undefined): Date | null | undefined {
  return value == null ? value : new Date(value);
}

export function registerSocialTools(server: McpServer) {
  server.registerTool(
    'get_social_post_metrics',
    {
      description:
        'Métricas dos posts PUBLICADOS nas redes sociais (Instagram, LinkedIn), por post ou por período de publicação: ' +
        'impressões, alcance, reações, comentários, partilhas, guardados, cliques, visualizações de vídeo, interações e ' +
        'taxa de engajamento, mais os totais por rede. Inclui os posts publicados fora do CRM quando a importação está ' +
        'ligada na conta (`origin: imported`). `accounts[].message` diz porque uma conta não tem (todas as) métricas e ' +
        'o que fazer — ex.: "métricas indisponíveis para perfil pessoal" do LinkedIn, ou token do Instagram sem a ' +
        'permissão de insights (pedir reconexão). Cada post traz `unavailableReason` quando faltam números. null = a ' +
        'rede não dá esse número, nunca zero. Só leitura.',
      inputSchema: {
        postId: z.string().optional().describe('Id do SocialPost (um post só)'),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Publicados a partir deste dia (AAAA-MM-DD, fuso de São Paulo)'),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Publicados até este dia (inclusive)'),
        provider: z.nativeEnum(SocialProvider).optional(),
        accountId: z.string().optional().describe('Id da SocialAccount'),
        includeHistory: z.boolean().optional().describe('Inclui os snapshots datados (evolução de cada post)'),
        take: z.number().int().min(1).max(500).optional().describe('Padrão 100'),
      },
    },
    (args) => run(async () => socialAgentMetrics.getSocialMetrics(args, await mcpCtx())),
  );

  server.registerTool(
    'list_social_accounts',
    {
      description:
        'Lista as contas de rede social conectadas ao CRM (LinkedIn, Instagram) — destino de um post. Nunca devolve ' +
        'tokens. Conta com isActive=false está desconectada: não aceita post novo até alguém reconectar em /settings/social. ' +
        'Só aparecem as contas a que o utilizador do MCP tem acesso: as pessoais dele e as da empresa que um admin lhe deu. ' +
        '`access.level`: VIEW (só ver), DRAFT (criar rascunhos e enviar para aprovação), PUBLISH (também agendar); ' +
        '`shared` = conta da empresa.',
      inputSchema: { activeOnly: z.boolean().optional() },
    },
    (args) => run(async () => socialAccounts.listAccountsFor(await mcpCtx(), args)),
  );

  server.registerTool(
    'create_social_post',
    {
      description:
        'Cria um post de rede social para UMA conta de destino. O post SEMPRE nasce como rascunho (DRAFT) e NUNCA vai ' +
        'ao ar sozinho: só um humano aprova, na tela /social do CRM (não existe tool de aprovação nem de publicação). ' +
        'Para a mesma ideia em várias redes, crie um post por conta com o mesmo campaignKey e adapte o texto a cada ' +
        'rede. A resposta traz `issues` (errors bloqueiam a aprovação, warnings só avisam) — corrija os errors com ' +
        'update_social_post antes de pedir aprovação. scheduledAt (ISO, futuro) é o horário sugerido; o humano confirma ' +
        'ao aprovar. sourceContentPostId liga o post ao artigo do blog que ele divulga.',
      inputSchema: {
        socialAccountId: z.string().describe('Id da conta de destino (list_social_accounts)'),
        text: textInput,
        mediaAssetIds: mediaInput.optional(),
        linkUrl: z.string().url().nullable().optional().describe('Link com prévia (só LinkedIn, sem imagens)'),
        scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
        sourceContentPostId: z.string().nullable().optional(),
        campaignKey: z.string().nullable().optional().describe('Agrupa as variações da mesma ideia entre redes'),
        topic: z.string().max(60).nullable().optional().describe('Tema/tag interna (ex.: "Power BI") — filtro e análise de desempenho por tema'),
        isIdea: z.boolean().optional().describe('true = ainda é só uma ideia (não pode ser aprovada até virar rascunho)'),
        utmAuto: z
          .boolean()
          .optional()
          .describe('true = o CRM acrescenta utm_source/medium/campaign/content ao linkUrl na hora de publicar (mede visitas e leads vindos do post)'),
        placement: placementInput,
      },
    },
    async ({ scheduledAt, ...args }) =>
      run(async () => socialPosts.createSocialPost({ ...args, scheduledAt: toDate(scheduledAt) }, await mcpCtx())),
  );

  server.registerTool(
    'update_social_post',
    {
      description:
        'Edita um post de rede social que ainda não foi publicado. Mudar texto, imagens, link ou destino de um post ' +
        'APROVADO (ou com erro) devolve ele para rascunho e apaga a aprovação — um humano precisa aprovar de novo. ' +
        'Mudar só scheduledAt/vínculos mantém a aprovação. Post publicado, em publicação ou arquivado não edita.',
      inputSchema: {
        id: z.string(),
        socialAccountId: z.string().optional(),
        text: textInput.optional(),
        mediaAssetIds: mediaInput.optional(),
        linkUrl: z.string().url().nullable().optional(),
        scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
        sourceContentPostId: z.string().nullable().optional(),
        campaignKey: z.string().nullable().optional(),
        topic: z.string().max(60).nullable().optional().describe('Tema/tag interna; não desfaz a aprovação'),
        isIdea: z.boolean().optional(),
        utmAuto: z.boolean().optional(),
        placement: placementInput,
      },
    },
    ({ id, scheduledAt, ...patch }) =>
      run(async () => socialPosts.updateSocialPost(id, { ...patch, scheduledAt: toDate(scheduledAt) }, await mcpCtx())),
  );

  server.registerTool(
    'schedule_social_post',
    {
      description:
        'Define o horário de publicação (ISO, no futuro) de um rascunho ou post aprovado. Não aprova nada: um rascunho ' +
        'agendado continua esperando aprovação humana em /social; num aprovado, só o horário muda.',
      inputSchema: { id: z.string(), scheduledAt: z.string().datetime({ offset: true }) },
    },
    ({ id, scheduledAt }) => run(async () => socialPosts.scheduleSocialPost(id, new Date(scheduledAt), await mcpCtx())),
  );

  server.registerTool(
    'unschedule_social_post',
    {
      description:
        'Tira o horário de um post. Num rascunho só limpa o horário; num post APROVADO, volta para rascunho (sem ' +
        'horário, aprovado significaria publicar já) — precisa de nova aprovação humana.',
      inputSchema: { id: z.string() },
    },
    ({ id }) => run(async () => socialPosts.unscheduleSocialPost(id, await mcpCtx())),
  );

  server.registerTool(
    'list_social_posts',
    {
      description:
        'Lista posts de rede social com filtros. status: DRAFT (esperando aprovação), APPROVED (aprovado/agendado), ' +
        'PUBLISHING, PUBLISHED, FAILED (veja lastError), ARCHIVED. Cada item traz a conta, as imagens e `issues`.',
      inputSchema: {
        status: z.nativeEnum(SocialPostStatus).optional(),
        provider: z.nativeEnum(SocialProvider).optional(),
        socialAccountId: z.string().optional(),
        sourceContentPostId: z.string().optional(),
        campaignKey: z.string().optional(),
        q: z.string().optional(),
        skip: z.number().int().min(0).optional(),
        take: z.number().int().min(1).max(100).optional(),
      },
    },
    (args) => run(async () => socialPosts.listSocialPosts(args, await mcpCtx())),
  );

  server.registerTool(
    'get_social_post',
    {
      description: 'Detalha um post de rede social: texto, imagens, destino, status, aprovação, link publicado e `issues`.',
      inputSchema: { id: z.string() },
    },
    ({ id }) => run(async () => socialPosts.getSocialPost(id, await mcpCtx())),
  );

  server.registerTool(
    'submit_social_post',
    {
      description:
        'Envia um rascunho para aprovação: quem pode publicar na conta recebe uma notificação no CRM. NÃO aprova nem ' +
        'publica — continua rascunho até um humano aprovar na tela /social. Use quando o rascunho estiver pronto ' +
        '(sem `issues.errors`), sobretudo em contas da empresa em que o utilizador só pode criar rascunhos.',
      inputSchema: { id: z.string() },
    },
    ({ id }) => run(async () => socialPosts.submitSocialPost(id, await mcpCtx())),
  );
}
