import { put } from '@vercel/blob';
import { prisma } from '@app/db';
import type { videos } from '@app/content';

/**
 * Onde a importação de vídeo (MCP) guarda o MP4: o mesmo store do upload pela
 * tela (`content`, só `BLOB_STORE_ID` — ver `api/content/assets/upload`).
 * Multipart: um vídeo de 200 MB não cabe num envio só.
 */
export const videoStorage: videos.VideoStorage = {
  async put(pathname, bytes, contentType) {
    if (!process.env.BLOB_STORE_ID) throw new Error('BLOB_STORE_ID não configurado — só funciona em produção/preview.');
    const blob = await put(pathname, Buffer.from(bytes), { access: 'public', contentType, addRandomSuffix: true, multipart: true });
    return { url: blob.url, pathname: blob.pathname };
  },
};

/**
 * O vídeo "já enviado" tem de estar no store do CRM: mesmo host dos arquivos
 * que a biblioteca já tem (o host do Blob não é configuração — vem do store).
 */
export async function isOwnBlobUrl(url: string): Promise<boolean> {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  if (!host.endsWith('.public.blob.vercel-storage.com')) return false;
  const known = await prisma.contentAsset.findFirst({ where: { url: { startsWith: `https://${host}/` } }, select: { id: true } });
  return !!known;
}
