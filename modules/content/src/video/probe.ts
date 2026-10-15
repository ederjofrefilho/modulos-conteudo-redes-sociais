// Lê de um MP4 o que as redes conferem — largura, altura e duração — sem
// ffmpeg (não existe numa função da Vercel). PURO: percorre as caixas ISO
// BMFF (`ftyp`, `moov` > `mvhd`, `trak` > `tkhd` + `mdia` > `hdlr`). Serve à
// importação de vídeo pelo MCP (URL ou arquivo local); no navegador quem mede
// é o próprio <video>.

export interface VideoProbe {
  width: number;
  height: number;
  durationMs: number;
  /** Marca do `ftyp` ("isom", "mp42", "qt  "...). */
  brand: string;
}

export class VideoProbeError extends Error {}

interface Box {
  type: string;
  start: number; // início do conteúdo (depois do cabeçalho)
  end: number;
}

function* boxes(view: DataView, from: number, to: number): Generator<Box> {
  let at = from;
  while (at + 8 <= to) {
    let size = view.getUint32(at);
    const type = String.fromCharCode(view.getUint8(at + 4), view.getUint8(at + 5), view.getUint8(at + 6), view.getUint8(at + 7));
    let header = 8;
    if (size === 1) {
      if (at + 16 > to) return;
      size = Number(view.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < header || at + size > to) return;
    yield { type, start: at + header, end: at + size };
    at += size;
  }
}

function child(view: DataView, parent: Box, type: string): Box | undefined {
  for (const b of boxes(view, parent.start, parent.end)) if (b.type === type) return b;
  return undefined;
}

export function probeMp4(bytes: Uint8Array): VideoProbe {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const top = [...boxes(view, 0, bytes.byteLength)];
  const ftyp = top.find((b) => b.type === 'ftyp');
  if (!ftyp || top[0]?.type !== 'ftyp') throw new VideoProbeError('O arquivo não é um vídeo MP4.');
  const brand = String.fromCharCode(...bytes.subarray(ftyp.start, ftyp.start + 4));
  const moov = top.find((b) => b.type === 'moov');
  if (!moov) throw new VideoProbeError('O MP4 não tem o índice (moov): exporte o vídeo de novo, em MP4 H.264.');

  const mvhd = child(view, moov, 'mvhd');
  if (!mvhd) throw new VideoProbeError('O MP4 não informa a duração (mvhd).');
  const v1 = view.getUint8(mvhd.start) === 1;
  const timescale = view.getUint32(mvhd.start + (v1 ? 20 : 12));
  const duration = v1 ? Number(view.getBigUint64(mvhd.start + 24)) : view.getUint32(mvhd.start + 16);
  if (!timescale) throw new VideoProbeError('O MP4 tem uma duração inválida.');

  for (const trak of boxes(view, moov.start, moov.end)) {
    if (trak.type !== 'trak') continue;
    const mdia = child(view, trak, 'mdia');
    const hdlr = mdia && child(view, mdia, 'hdlr');
    if (!hdlr) continue;
    const handler = String.fromCharCode(...bytes.subarray(hdlr.start + 8, hdlr.start + 12));
    if (handler !== 'vide') continue;
    const tkhd = child(view, trak, 'tkhd');
    if (!tkhd) continue;
    const tv1 = view.getUint8(tkhd.start) === 1;
    const matrixAt = tkhd.start + 4 + (tv1 ? 32 : 20) + 8 + 8;
    const a = view.getInt32(matrixAt);
    const b = view.getInt32(matrixAt + 4);
    let width = Math.round(view.getUint32(matrixAt + 36) / 65536);
    let height = Math.round(view.getUint32(matrixAt + 40) / 65536);
    // Vídeo do telemóvel gravado em pé: a matriz roda 90°/270° — o que se vê é altura × largura.
    if (a === 0 && Math.abs(b) === 65536) [width, height] = [height, width];
    if (!width || !height) throw new VideoProbeError('O MP4 não informa o tamanho do vídeo.');
    return { width, height, durationMs: Math.round((duration / timescale) * 1000), brand };
  }
  throw new VideoProbeError('O MP4 não tem faixa de vídeo.');
}
