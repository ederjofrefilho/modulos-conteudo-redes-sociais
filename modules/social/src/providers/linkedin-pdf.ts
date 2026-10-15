import { PDFDocument } from 'pdf-lib';

// Carrossel do LinkedIn em PDF: o feed mostra um documento como slides
// deslizáveis, com mais alcance e leitura que a grade de várias imagens
// (pedido de produto em 10/10/2026). Juntar imagens prontas numa página cada é
// conversão de formato, sem decisão nenhuma (princípio 2 do CLAUDE.md).
// Puro: recebe os bytes, devolve o PDF; quem baixa e envia é o adaptador.

export interface PdfPage {
  bytes: Uint8Array;
  mimeType: string;
}

/**
 * Uma página por imagem, do tamanho exato da imagem (1 px = 1 pt), sem
 * margem: o LinkedIn mostra a página inteira, então a peça 1080×1350 aparece
 * igual à imagem. Só JPEG e PNG (os formatos que o PDF embute sem recodificar).
 */
export async function imagesToPdf(pages: PdfPage[], title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator('CRM');
  doc.setProducer('CRM');
  for (const [i, page] of pages.entries()) {
    const image =
      page.mimeType === 'image/png'
        ? await doc.embedPng(page.bytes)
        : page.mimeType === 'image/jpeg'
          ? await doc.embedJpg(page.bytes)
          : null;
    if (!image) throw new Error(`Imagem ${i + 1} não é JPEG nem PNG — não entra no PDF.`);
    const pdfPage = doc.addPage([image.width, image.height]);
    pdfPage.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  return doc.save();
}

/**
 * Título do documento (aparece no topo do carrossel no feed): o título do
 * artigo de origem quando há; senão a primeira linha do texto, sem hashtags.
 */
export function documentTitleFor(text: string, sourceTitle?: string | null): string {
  const fromSource = sourceTitle?.trim();
  if (fromSource) return clip(fromSource);
  const firstLine =
    text
      .split('\n')
      .map((l) => l.replace(/#[\p{L}\p{N}_]+/gu, '').trim())
      .find(Boolean) ?? '';
  return clip(firstLine || 'Carrossel');
}

function clip(s: string, max = 100): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 60 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
