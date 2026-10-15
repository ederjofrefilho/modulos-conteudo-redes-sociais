import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { IMAGE_PALETTE as P, parseRich, plainRich, type ImageFields } from '@app/content/image-templates';
import type { LoadedImage, LoadedMedia } from './media';

/**
 * Peças da arte no padrão do design system da marca: texto com ênfase, logo,
 * indicador de página, quadrado com seta e aparelhos desenhados em volta de
 * um print. Satori só entende flexbox e estilo inline: todo elemento com mais
 * de um filho precisa de `display: flex`.
 */

export const DISPLAY = 'IBM Plex Sans';
export const UI = 'Inter';
/** Rótulo de dado e endereço (brand book de 14/10/2026); rótulo de seção continua Inter. */
export const MONO = 'IBM Plex Mono';

/** Margem lateral e largura útil das peças de rede social (1080 de largura). */
const M = 88;
const TEXT_W = 1080 - 2 * M;

/** Linhas que um texto ocupa, estimadas pela largura média do caractere — basta para posicionar a mídia e encaixar o texto. */
export function lines(text: string, size: number, width: number, charWidth = 0.5): number {
  if (!text) return 0;
  const perLine = Math.max(8, Math.floor(width / (size * charWidth)));
  let count = 0;
  let current = 0;
  for (const word of plainRich(text).split(/\s+/)) {
    const len = word.length + (current ? 1 : 0);
    if (current + len > perLine) {
      count += 1;
      current = word.length;
    } else current += len;
  }
  return count + 1;
}

export const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
export const abs = (style: CSSProperties): CSSProperties => ({ position: 'absolute', display: 'flex', ...style });

export type ThemeName = 'escuro' | 'claro' | 'branco';
export type Tone = (typeof P)['light'] | (typeof P)['dark'];

export function toneOf(theme: ThemeName): Tone {
  return theme === 'escuro' ? P.dark : P.light;
}

/** Fundo da peça. Escuro é preto com um brilho azul longo no canto inferior direito. */
export function background(theme: ThemeName): CSSProperties {
  if (theme === 'escuro') {
    return {
      backgroundColor: P.dark.bg,
      backgroundImage: `radial-gradient(ellipse 95% 70% at 100% 100%, ${P.dark.glow} 0%, ${P.dark.bg} 70%)`,
    };
  }
  // Claro: um cinza bem suave no canto superior esquerdo, como nos posts já publicados.
  const base = theme === 'branco' ? P.sheet : P.light.bg;
  return {
    backgroundColor: base,
    backgroundImage: `radial-gradient(ellipse 80% 45% at 0% 0%, ${P.light.glow} 0%, ${base} 70%)`,
  };
}

export function Canvas({ theme, children }: { theme: ThemeName; children: ReactNode }) {
  return (
    <div style={{ position: 'relative', display: 'flex', width: '100%', height: '100%', overflow: 'hidden', fontFamily: DISPLAY, ...background(theme) }}>
      {children}
    </div>
  );
}

/** Logo à esquerda e traços de página à direita, na mesma linha, em toda peça. */
export function TopBar({ f, tone, logo }: { f: ImageFields; tone: Tone; logo: LoadedImage }) {
  const index = f.index ? Number(f.index) : 0;
  const total = f.total ? Number(f.total) : 0;
  return (
    <div style={abs({ left: M, top: M, width: TEXT_W, height: 44, alignItems: 'center', justifyContent: 'space-between' })}>
      <Logo logo={logo} height={44} />
      {index && total ? <PageDots index={index} total={total} tone={tone} /> : null}
    </div>
  );
}

/**
 * Texto com **negrito**, ==marca-texto== e !!carmim!! (a palavra da dor). Cada palavra vira um item de um
 * flex com quebra — é o jeito de misturar estilos e ainda quebrar linha no
 * Satori. A palavra marcada leva o espaço seguinte como padding, para o bloco
 * teal ficar contínuo atrás da frase.
 */
export function Rich({
  text,
  size,
  weight = 400,
  lineHeight = 1.15,
  letterSpacing,
  color,
  width,
}: {
  text: string;
  size: number;
  weight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  color: string;
  width?: number;
}) {
  const space = Math.round(size * 0.26);
  // Espaço depois de cada palavra só onde o texto original tinha espaço:
  // "**1 dia**, não" não pode virar "1 dia , não".
  const segs = parseRich(text);
  const words: Array<{ word: string; style: 'normal' | 'bold' | 'mark' | 'pain'; first: boolean; last: boolean; spaceAfter: boolean }> = [];
  segs.forEach((seg, si) => {
    const parts = seg.text.split(/\s+/).filter(Boolean);
    const next = segs[si + 1];
    const gapAfterSeg = /\s$/.test(seg.text) || (next ? /^\s/.test(next.text) : false);
    parts.forEach((word, i) =>
      words.push({
        word,
        style: seg.style,
        first: i === 0,
        last: i === parts.length - 1,
        spaceAfter: i < parts.length - 1 || gapAfterSeg,
      }),
    );
  });
  const markPad = Math.round(size * 0.12);
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        ...(width === undefined ? {} : { width }),
        fontFamily: DISPLAY,
        fontSize: size,
        lineHeight,
        // O Satori quebra com estilo `undefined`: só manda quando veio.
        ...(letterSpacing === undefined ? {} : { letterSpacing }),
        color,
        rowGap: words.some((w) => w.style === 'mark') ? Math.round(size * 0.1) : 0,
      }}
    >
      {words.map((w, i) => {
        const mark = w.style === 'mark';
        const style: CSSProperties = { fontWeight: w.style === 'bold' || w.style === 'pain' ? 600 : weight };
        if (w.style === 'pain') style.color = P.signalRed;
        if (mark) {
          style.backgroundColor = P.teal;
          style.color = P.onTeal;
          style.paddingLeft = w.first ? markPad : 0;
          style.paddingRight = w.last ? markPad : space;
          if (w.last && w.spaceAfter) style.marginRight = space;
        } else if (w.spaceAfter) {
          style.marginRight = space;
        }
        return (
          <span key={i} style={style}>
            {w.word}
          </span>
        );
      })}
    </div>
  );
}

/** Rótulo em caixa alta (Inter 600, `teal-ink`). */
export function Label({ text, tone }: { text: string; tone: Tone }) {
  return (
    <div style={{ fontFamily: UI, fontSize: 20, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: tone.tealInk }}>
      {text}
    </div>
  );
}

/** Indicador de página: traços, o atual em teal (como nos carrosséis já publicados). */
export function PageDots({ index, total, tone }: { index: number; total: number; tone: Tone }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{ width: 44, height: 8, borderRadius: 8, backgroundColor: i + 1 === index ? P.teal : tone.dot }}
        />
      ))}
    </div>
  );
}

export function Logo({ logo, height, style }: { logo: LoadedImage; height: number; style?: CSSProperties }) {
  const width = Math.round((logo.width / logo.height) * height);
  // eslint-disable-next-line @next/next/no-img-element -- arte do Satori, não é página
  return <img src={logo.src} width={width} height={height} alt="" style={style} />;
}

/** Quadrado com seta ↗ no canto inferior direito, na margem: a sequência continua. */
export function ArrowSquare({ tone, size = 112, inset = 88 }: { tone: Tone; size?: number; inset?: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        right: inset,
        bottom: inset,
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tone.arrowBg,
      }}
    >
      <svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke={tone.arrowFg} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 18L18 6" />
        <path d="M8 6h10v10" />
      </svg>
    </div>
  );
}

export type Frame = 'notebook' | 'navegador' | 'tablet' | 'celular' | 'nenhum';

/** Altura total do aparelho desenhado para uma dada largura (para posicionar sem medir). */
export function frameHeight(frame: Frame, width: number, media: LoadedMedia): number {
  const ratio = media.height / media.width;
  switch (frame) {
    case 'notebook':
      return Math.round((width * 0.88 - 32) * ratio + 38 + 26);
    case 'navegador':
      return Math.round(width * ratio + 46);
    case 'tablet':
      return Math.round((width - 56) * ratio + 56);
    case 'celular':
      return Math.round(width * 2.05);
    default:
      return Math.round(width * ratio);
  }
}

/**
 * Aparelho desenhado em volta de um print plano — é o que transforma
 * qualquer print de painel num mockup novo, sem foto de produto.
 */
export function DeviceFrame({ frame, media, width }: { frame: Frame; media: LoadedMedia; width: number }): ReactElement {
  const D = P.device;
  const ratio = media.height / media.width;
  const img = (w: number, h: number, extra?: CSSProperties) => (
    // eslint-disable-next-line @next/next/no-img-element -- arte do Satori, não é página
    <img src={media.src} width={w} height={h} alt="" style={{ objectFit: 'cover', objectPosition: frame === 'celular' ? 'center top' : 'left top', ...extra }} />
  );

  if (frame === 'notebook') {
    const screenW = Math.round(width * 0.88);
    const innerW = screenW - 32;
    const innerH = Math.round(innerW * ratio);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width }}>
        <div
          style={{
            display: 'flex',
            padding: '22px 16px 16px',
            backgroundColor: D.bezel,
            border: `2px solid ${D.bezelEdge}`,
            borderRadius: '26px 26px 0 0',
          }}
        >
          {img(innerW, innerH, { borderRadius: 4 })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', width, height: 26, backgroundColor: D.body, borderRadius: '0 0 22px 22px', boxShadow: P.shadow.device }}>
          <div style={{ width: Math.round(width * 0.16), height: 10, backgroundColor: D.bodyShade, borderRadius: '0 0 10px 10px' }} />
        </div>
      </div>
    );
  }
  if (frame === 'navegador') {
    const h = Math.round(width * ratio);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', width, borderRadius: 18, overflow: 'hidden', boxShadow: P.shadow.device, backgroundColor: P.sheet }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 46, paddingLeft: 20, backgroundColor: D.browserBar }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: 13, height: 13, borderRadius: 13, backgroundColor: D.browserDot }} />
          ))}
        </div>
        {img(width, h)}
      </div>
    );
  }
  if (frame === 'tablet') {
    const innerW = width - 56;
    return (
      <div style={{ display: 'flex', padding: 28, backgroundColor: D.bezel, border: `2px solid ${D.bezelEdge}`, borderRadius: 46, boxShadow: P.shadow.device }}>
        {img(innerW, Math.round(innerW * ratio), { borderRadius: 14 })}
      </div>
    );
  }
  if (frame === 'celular') {
    const innerW = width - 32;
    const innerH = frameHeight('celular', width, media) - 32;
    return (
      <div style={{ display: 'flex', padding: 16, backgroundColor: D.bezel, border: `2px solid ${D.bezelEdge}`, borderRadius: 64, boxShadow: P.shadow.device }}>
        {img(innerW, innerH, { borderRadius: 48 })}
      </div>
    );
  }
  return img(width, Math.round(width * ratio), { borderRadius: 18, boxShadow: P.shadow.device });
}
