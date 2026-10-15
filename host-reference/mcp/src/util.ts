import { AsyncLocalStorage } from 'node:async_hooks';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { users, type Ctx } from '@app/core';

/**
 * Carrega o Ctx de uma requisição HTTP remota (resolvido a partir do access
 * token OAuth em apps/web/src/app/api/mcp) através da árvore de chamadas
 * assíncronas do SDK — sem precisar mudar a assinatura de nenhuma tool.
 */
const ctxStorage = new AsyncLocalStorage<Ctx>();

/** Executa `fn` com `ctx` disponível para qualquer `mcpCtx()` chamado dentro dela. */
export function runWithCtx<T>(ctx: Ctx, fn: () => Promise<T>): Promise<T> {
  // Tudo que passa por aqui é chamada de tool — eventos gravados nela são "mcp".
  return ctxStorage.run({ ...ctx, source: 'mcp' }, fn);
}

/**
 * Resolve o Ctx do MCP. Em requisições HTTP remotas, vem do `AsyncLocalStorage`
 * (setado por `runWithCtx` a partir do access token OAuth). Em stdio local, cai
 * no caminho antigo: MCP_ACTOR_EMAIL (env do processo, configurada no
 * claude_desktop_config.json de quem conecta — ver CLAUDE.md); consultamos o
 * banco a cada chamada (sem cache) para refletir na hora uma desativação.
 */
export async function mcpCtx(): Promise<Ctx> {
  const stored = ctxStorage.getStore();
  if (stored) return stored;

  const email = process.env.MCP_ACTOR_EMAIL?.trim();
  if (!email) {
    throw new Error(
      'MCP_ACTOR_EMAIL não configurado — defina no ambiente do cliente MCP (claude_desktop_config.json) ' +
        'com o e-mail do usuário do CRM que está operando esta sessão.',
    );
  }
  const actor = await users.getActorByEmail(email);
  if (!actor) {
    throw new Error(`MCP_ACTOR_EMAIL="${email}" não corresponde a um usuário ativo do CRM.`);
  }
  return { actor, source: 'mcp' };
}

/** Resposta de sucesso: serializa o dado como JSON textual. */
export function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/** Resposta de erro (isError=true) — o cliente/AI vê a mensagem e pode reagir. */
export function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `Erro: ${message}` }], isError: true };
}

/**
 * Executa o handler de uma tool traduzindo exceções em resposta de erro,
 * evitando derrubar o servidor. Padrão único para todas as tools.
 */
export async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Imagens do conteúdo (`render_content_image`/`import_content_image`). Quem
 * desenha e guarda é o `apps/web` (next/og + Vercel Blob), que o MCP local
 * (stdio) não alcança. Dois caminhos:
 * - MCP remoto (dentro do apps/web): a rota `/api/mcp` registra um backend
 *   em processo com `setContentImageBackend` — chama o serviço direto.
 * - MCP local: cai no backend HTTP, que chama `POST /api/content/assets/*`
 *   do CRM com `CRM_URL` + `CRM_API_TOKEN` (token com escopo `content:write`).
 */
export interface ContentImageBackend {
  /** `getCtx` só é chamado por quem precisa do ator (o backend em processo); no HTTP o token já identifica. */
  render(input: unknown, getCtx: () => Promise<Ctx>): Promise<unknown>;
  importFromUrl(input: unknown, getCtx: () => Promise<Ctx>): Promise<unknown>;
  /** Vídeo MP4 por URL pública (o CRM baixa, mede e guarda). */
  importVideo(input: unknown, getCtx: () => Promise<Ctx>): Promise<unknown>;
  /** Arquivo do computador: só existe no MCP local (o remoto não vê o disco de ninguém). */
  uploadVideoFile?(input: { filePath: string; alt: string }): Promise<unknown>;
}

let contentImageBackend: ContentImageBackend | null = null;

export function setContentImageBackend(backend: ContentImageBackend | null) {
  contentImageBackend = backend;
}

export function getContentImageBackend(): ContentImageBackend {
  return contentImageBackend ?? httpContentImageBackend;
}

function crmConfig() {
  const base = process.env.CRM_URL?.trim().replace(/\/+$/, '');
  const token = process.env.CRM_API_TOKEN?.trim();
  return { base, token };
}

async function postToCrm(path: string, input: unknown): Promise<unknown> {
  const { base, token } = crmConfig();
  if (!base || !token) {
    throw new Error(
      'CRM_URL/CRM_API_TOKEN não configurados — imagens são geradas e guardadas pelo CRM (Vercel Blob), que o MCP ' +
        'local não alcança. Defina no ambiente do cliente MCP (.mcp.json/claude_desktop_config.json): CRM_URL ' +
        '(ex.: https://app.example.com) e CRM_API_TOKEN (crie em /settings/api-tokens com acesso "Imagens do ' +
        'conteúdo (content:write)").',
    );
  }
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* corpo não-JSON (ex.: página de erro) — usa o texto cru na mensagem */
  }
  if (!res.ok) {
    const err = data as { error?: string; issues?: unknown };
    const detail = err?.issues ? ` ${JSON.stringify(err.issues)}` : '';
    throw new Error(`CRM respondeu ${res.status}: ${err?.error ?? String(text).slice(0, 200)}${detail}`);
  }
  return data;
}

const httpContentImageBackend: ContentImageBackend = {
  render: (input) => postToCrm('/api/content/assets/render', input),
  importFromUrl: (input) => postToCrm('/api/content/assets/import', input),
  importVideo: (input) => postToCrm('/api/content/assets/import-video', input),
  // Lê o MP4 do disco, mede (mesmo leitor do servidor), sobe direto ao Blob
  // pelo token de upload do CRM (como o navegador) e regista o asset.
  async uploadVideoFile({ filePath, alt }) {
    const { base, token } = crmConfig();
    if (!base || !token) return postToCrm('/api/content/assets/register-video', {}); // mesma mensagem de configuração
    const { readFile, stat } = await import('node:fs/promises');
    const { basename } = await import('node:path');
    const { probeMp4 } = await import('@app/content');
    const { MAX_VIDEO_BYTES } = await import('@app/content/media');
    const info = await stat(filePath).catch(() => null);
    if (!info?.isFile()) throw new Error(`Arquivo não encontrado: ${filePath}`);
    if (info.size > MAX_VIDEO_BYTES) throw new Error(`O vídeo tem ${Math.round(info.size / 1048576)} MB — o CRM aceita até ${MAX_VIDEO_BYTES / 1048576} MB.`);
    const bytes = new Uint8Array(await readFile(filePath));
    const probe = probeMp4(bytes);
    if (probe.brand.startsWith('qt')) throw new Error('O arquivo é MOV (QuickTime): exporte em MP4 (H.264).');
    const { upload } = await import('@vercel/blob/client');
    const name = basename(filePath).replace(/[^a-zA-Z0-9._-]+/g, '-');
    const blob = await upload(`content/videos/${name}`, new Blob([bytes], { type: 'video/mp4' }), {
      access: 'public',
      contentType: 'video/mp4',
      handleUploadUrl: `${base}/api/content/assets/upload`,
      headers: { Authorization: `Bearer ${token}` },
      multipart: info.size > 20 * 1048576,
    });
    return postToCrm('/api/content/assets/register-video', {
      url: blob.url,
      pathname: blob.pathname,
      alt,
      bytes: info.size,
      width: probe.width,
      height: probe.height,
      durationMs: probe.durationMs,
    });
  },
};
