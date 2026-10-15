import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { oauth } from '@app/core';
import { createAppMcpServer } from '@app/mcp/server';
import { runWithCtx, setContentImageBackend } from '@app/mcp/util';
import { images, videos } from '@app/content';
import { videoStorage } from '@/lib/content-videos';
import { protectedResourceMetadataUrl } from '@/lib/oauth';
import { contentImageDeps } from '@/lib/content-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// import_content_video baixa até 200 MB e reenvia ao Blob dentro da chamada.
export const maxDuration = 60;

// Aqui o MCP roda dentro do próprio CRM: as tools de imagem chamam o serviço
// direto, sem o desvio HTTP (CRM_URL/CRM_API_TOKEN) que o MCP local precisa.
setContentImageBackend({
  render: async (input, getCtx) => images.renderContentImage(input, await getCtx(), contentImageDeps()),
  importFromUrl: async (input, getCtx) => images.importContentImage(input, await getCtx(), contentImageDeps()),
  importVideo: async (input, getCtx) => videos.importContentVideo(input, await getCtx(), { storage: videoStorage }),
});

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'invalid_token' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      // É assim que um client MCP descobre onde autenticar a partir de um 401.
      'WWW-Authenticate': `Bearer resource_metadata="${protectedResourceMetadataUrl()}"`,
    },
  });
}

/**
 * Endpoint de dados do MCP remoto (Streamable HTTP, stateless — uma
 * requisição, uma resposta, sem estado entre chamadas: cada uma resolve seu
 * próprio Ctx a partir do access token e constrói um McpServer/transport
 * novo). O Ctx fica disponível para as tools via AsyncLocalStorage
 * (mcpCtx()/runWithCtx() em apps/mcp/src/util.ts) — nenhuma tool precisou
 * mudar de assinatura.
 */
async function handleMcp(req: Request): Promise<Response> {
  const auth = req.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return unauthorized();

  const ctx = await oauth.resolveCtxFromOAuthToken(token);
  if (!ctx) return unauthorized();

  return runWithCtx(ctx, async () => {
    const server = createAppMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(req);
  });
}

export const POST = handleMcp;
export const GET = handleMcp;
export const DELETE = handleMcp;
