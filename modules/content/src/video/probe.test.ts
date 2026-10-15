import { describe, expect, it } from 'vitest';
import { VideoProbeError, probeMp4 } from './probe.js';

function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const size = 8 + parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, size);
  out.set([...type].map((c) => c.charCodeAt(0)), 4);
  let at = 8;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

const bytes = (n: number, fill: (v: DataView) => void) => {
  const b = new Uint8Array(n);
  fill(new DataView(b.buffer));
  return b;
};

/** MP4 mínimo: ftyp + moov(mvhd + trak(tkhd + mdia(hdlr vide))). */
function mp4({ width, height, seconds, rotate = false, brand = 'isom' }: { width: number; height: number; seconds: number; rotate?: boolean; brand?: string }) {
  const ftyp = box('ftyp', new Uint8Array([...brand].map((c) => c.charCodeAt(0))), new Uint8Array(4));
  const mvhd = box('mvhd', bytes(100, (v) => {
    v.setUint32(12, 1000); // timescale
    v.setUint32(16, seconds * 1000); // duration
  }));
  const tkhd = box('tkhd', bytes(84, (v) => {
    const matrix = 4 + 20 + 16;
    v.setInt32(matrix, rotate ? 0 : 65536);
    v.setInt32(matrix + 4, rotate ? 65536 : 0);
    v.setUint32(matrix + 36, width * 65536);
    v.setUint32(matrix + 40, height * 65536);
  }));
  const hdlr = box('hdlr', bytes(24, (v) => [...'vide'].forEach((c, i) => v.setUint8(8 + i, c.charCodeAt(0)))));
  const trak = box('trak', tkhd, box('mdia', hdlr));
  return new Uint8Array([...ftyp, ...box('moov', mvhd, trak)]);
}

describe('probeMp4', () => {
  it('lê largura, altura e duração', () => {
    expect(probeMp4(mp4({ width: 1920, height: 1080, seconds: 24 }))).toEqual({ width: 1920, height: 1080, durationMs: 24_000, brand: 'isom' });
  });

  it('vídeo gravado em pé (matriz de 90°) devolve a forma que se vê', () => {
    expect(probeMp4(mp4({ width: 1920, height: 1080, seconds: 10, rotate: true }))).toMatchObject({ width: 1080, height: 1920 });
  });

  it('recusa o que não é MP4 e o MP4 sem índice', () => {
    expect(() => probeMp4(new TextEncoder().encode('<html>não é vídeo</html>'))).toThrow(VideoProbeError);
    expect(() => probeMp4(box('ftyp', new TextEncoder().encode('isom'), new Uint8Array(4)))).toThrow(/moov/);
  });
});
