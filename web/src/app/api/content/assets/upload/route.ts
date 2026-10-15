import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { ASSET_MIME_TYPES, MAX_VIDEO_BYTES } from '@app/content/media';
import { ForbiddenError, requireScope } from '@app/core';
import { requireCtx } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Imagens e, desde 14/10/2026, vídeo MP4 (feito fora do CRM, só enviado
// para publicar nas redes). O teto vale para os dois; imagem nunca chega perto.
const ALLOWED_TYPES = [...ASSET_MIME_TYPES];

/**
 * Rota de token do upload client-side (Fase B) — o navegador nunca sobe o
 * arquivo por aqui, só pede um token de curta duração e fala direto com o
 * Blob. Store dedicado (`content`, público — ver BACKLOG.md).
 *
 * **Sem `token` explícito, de propósito.** O connect do dashboard não usou
 * um `BLOB_READ_WRITE_TOKEN` próprio (esse nome já é do store do desktop,
 * `apps/desktop/scripts/publish-update.mjs`) — conectou via OIDC: só
 * `BLOB_STORE_ID` (aponta pro store certo) + `BLOB_WEBHOOK_PUBLIC_KEY`,
 * sem token estático nenhum. `handleUpload`/`put`/`upload` do `@vercel/blob`
 * resolvem OIDC (`VERCEL_OIDC_TOKEN`, injetado pela Vercel em runtime) +
 * `BLOB_STORE_ID` automaticamente e IGNORAM `BLOB_READ_WRITE_TOKEN` quando
 * os dois primeiros existem — passar um `token` aqui seria não só inútil
 * como confuso de ler depois. Só funciona deployado (produção/preview); em
 * `next dev` local não há `BLOB_STORE_ID` nem OIDC — por isso o guard abaixo.
 *
 * Exige sessão de navegador (`requireCtx`) — só quem já está logado no CRM
 * pode pedir um token de upload; não é uma rota pública.
 */
export async function POST(request: Request) {
  // Token de API (MCP local a subir um vídeo) precisa do escopo de conteúdo; sessão passa sempre.
  try {
    requireScope(await requireCtx(), 'content:write');
  } catch (err) {
    const forbidden = err instanceof ForbiddenError;
    return NextResponse.json(
      { error: forbidden ? err.message : 'Sessão ou token de API inválido.' },
      { status: forbidden ? 403 : 401 },
    );
  }

  if (!process.env.BLOB_STORE_ID) {
    return NextResponse.json(
      { error: 'BLOB_STORE_ID não configurado — conecte o store "content" ao projeto (Storage > content > Connect Project).' },
      { status: 500 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_TYPES,
        maximumSizeInBytes: MAX_VIDEO_BYTES,
        addRandomSuffix: true,
      }),
      // O registro do ContentAsset (com alt, width/height medidos no
      // cliente) acontece por uma server action logo que upload() resolve
      // no navegador — não aqui. onUploadCompleted só dispara via webhook
      // público da Vercel, que não existe em dev local; depender dele
      // deixaria o fluxo de upload sem funcionar na máquina de desenvolvimento.
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha no upload' }, { status: 400 });
  }
}
