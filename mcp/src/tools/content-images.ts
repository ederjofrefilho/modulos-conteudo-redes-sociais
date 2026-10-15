import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TEMPLATE_INPUT_IDS, describeBrandMedia, describeImageTemplates } from '@app/content/image-templates';
import { run, mcpCtx, getContentImageBackend } from '../util.js';

/**
 * Imagens do conteúdo (Etapa 1 de docs/PLANO-REDES-SOCIAIS.md). Finas: o
 * backend (HTTP para o CRM no MCP local, serviço direto no remoto — ver
 * `getContentImageBackend` em util.ts) faz tudo. Nenhuma gera conteúdo: o
 * texto que vai na arte é o que o Claude passar.
 */
export function registerContentImageTools(server: McpServer) {
  server.registerTool(
    'render_content_image',
    {
      description:
        'Gera uma imagem a partir de um modelo fixo no design system da marca (IBM Plex Sans + Inter, preto/off-white/' +
        'branco com teal só de acento, logo de verdade, margem de 88px) e salva na biblioteca de conteúdo ' +
        '(ContentAsset, JPEG). Você escreve os textos; o CRM só desenha. Peças de rede social saem em 1080x1350 ' +
        '(Instagram e LinkedIn). Carrossel: abra com social-cover no tema escuro, miolo com social-slide/social-stat/' +
        'social-mockup no tema claro (mesmos index/total) e feche com social-cta no escuro. Título com **negrito** ' +
        'só nas palavras-chave e no máximo um ==marca-texto== por sequência; sem travessão. Mockups são ' +
        'protagonistas: use `media` com um id do catálogo ou o id de uma imagem da biblioteca (print de painel ' +
        'enviado; ganha o aparelho de `frame`). Catálogo: ' +
        `${describeBrandMedia()}. Modelos e campos: ${describeImageTemplates()}. Nomes antigos (ig-quote, ig-stat, ` +
        'ig-carousel-slide, li-card) ainda funcionam e caem no modelo novo. Texto acima do limite é recusado com ' +
        'erro por campo: encurte, não corte no meio. Use o id devolvido como `coverAssetId` em update_post (capa ' +
        'do blog), em blocos image ou em mediaAssetIds de create_social_post. `alt` é obrigatório.',
      inputSchema: {
        template: z.enum(TEMPLATE_INPUT_IDS),
        fields: z.record(z.union([z.string(), z.number()])).describe('Campos do modelo escolhido (ver descrição).'),
        alt: z.string().min(1).max(300),
      },
    },
    (args) => run(() => getContentImageBackend().render(args, mcpCtx)),
  );

  server.registerTool(
    'import_content_image',
    {
      description:
        'Importa uma imagem por URL pública para a biblioteca de conteúdo (ContentAsset). Aceita JPEG, PNG, ' +
        'WebP ou GIF até 10 MB; endereços internos são recusados. target "social" converte para JPEG (exigência ' +
        'do Instagram) e reduz para no máximo 1440px de largura; "blog" (padrão) mantém o formato. Só importe ' +
        'imagem que a empresa pode usar (própria, licenciada ou de banco livre). `alt` é obrigatório.',
      inputSchema: {
        url: z.string().url(),
        alt: z.string().min(1).max(300),
        target: z.enum(['blog', 'social']).optional(),
      },
    },
    (args) => run(() => getContentImageBackend().importFromUrl(args, mcpCtx)),
  );

  server.registerTool(
    'import_content_video',
    {
      description:
        'Importa um vídeo MP4 por URL pública (link direto para o arquivo: Dropbox com ?dl=1, Google Drive em ' +
        'download direto, um site...) para a biblioteca de conteúdo. O CRM baixa (até 200 MB, nunca endereço ' +
        'interno), mede largura, altura e duração e guarda. O vídeo é feito fora do CRM: aqui só entra. Use o id ' +
        'devolvido, sozinho, em mediaAssetIds de create_social_post — Instagram: placement "reel" (9:16, 3 s a ' +
        '15 min) ou "story" (até 60 s); LinkedIn: 3 s a 30 min, 16:9 ou 9:16. `alt` descreve o vídeo.',
      inputSchema: {
        url: z.string().url(),
        alt: z.string().min(1).max(500),
      },
    },
    (args) => run(() => getContentImageBackend().importVideo(args, mcpCtx)),
  );

  server.registerTool(
    'upload_content_video',
    {
      description:
        'Envia um vídeo MP4 do computador (caminho de arquivo local) para a biblioteca de conteúdo. Só funciona ' +
        'no MCP local (Claude Code/Desktop com CRM_URL e CRM_API_TOKEN com acesso content:write): o arquivo vai ' +
        'direto ao armazenamento do CRM, até 200 MB. No MCP remoto, use import_content_video com um link público. ' +
        'Devolve o ContentAsset (id, largura, altura, duração) para usar em create_social_post.',
      inputSchema: {
        filePath: z.string().min(1).describe('Caminho absoluto do .mp4 (ex.: C:/Users/.../video.mp4)'),
        alt: z.string().min(1).max(500),
      },
    },
    (args) =>
      run(async () => {
        const backend = getContentImageBackend();
        if (!backend.uploadVideoFile)
          throw new Error('Enviar arquivo do computador só funciona no MCP local. Aqui, use import_content_video com um link público do vídeo.');
        return backend.uploadVideoFile(args);
      }),
  );
}
