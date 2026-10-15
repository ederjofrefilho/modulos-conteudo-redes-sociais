import type { CSSProperties, ReactElement } from 'react';
import { DeviceFrame, frameHeight, type Frame } from './art-parts';
import type { LoadedMedia } from './media';

/**
 * Onde a mídia entra na peça. Mockup: inteiro, grande, sangrando à direita
 * e embaixo (celular inclinado na chamada, como na peça de referência).
 * Foto: faixa de borda a borda. Print: aparelho desenhado em volta.
 */

const abs = (style: CSSProperties): CSSProperties => ({ position: 'absolute', display: 'flex', ...style });

export function MediaArea({
  media,
  frame,
  top,
  W,
  H,
  M,
  rotatePhone = false,
}: {
  media: LoadedMedia;
  frame: Frame;
  top: number;
  W: number;
  H: number;
  M: number;
  rotatePhone?: boolean;
}): ReactElement {
  const area = H - top;
  if (media.kind === 'photo') {
    // eslint-disable-next-line @next/next/no-img-element -- arte do Satori, não é página
    return <img src={media.src} width={W} height={area} alt="" style={{ position: 'absolute', left: 0, top, objectFit: 'cover' }} />;
  }
  if (media.kind === 'mockup') {
    const ratio = media.width / media.height;
    let h = area + 80;
    let w = h * ratio;
    if (w > W - M + 120) {
      w = W - M + 120;
      h = w / ratio;
    }
    const portrait = ratio < 0.7;
    const left = portrait ? W - w - 40 : Math.max(M, W + 60 - w);
    const style: CSSProperties = { position: 'absolute', left: Math.round(left), top };
    if (portrait && rotatePhone) style.transform = 'rotate(-8deg)';
    // eslint-disable-next-line @next/next/no-img-element -- arte do Satori, não é página
    return <img src={media.src} width={Math.round(w)} height={Math.round(h)} alt="" style={style} />;
  }
  if (frame === 'celular') {
    const width = Math.round(Math.min(460, (area + 140) / 2.05));
    return (
      <div style={abs({ left: W - width - 72, top })}>
        <DeviceFrame frame="celular" media={media} width={width} />
      </div>
    );
  }
  // Notebook, tablet, navegador ou print solto: largo, encostado na margem e sangrando à direita.
  let width = W - M + 60;
  const fits = area - 40;
  const natural = frameHeight(frame, width, media);
  if (natural > fits) width = Math.max(420, Math.round((width * fits) / natural));
  return (
    <div style={abs({ left: M, top })}>
      <DeviceFrame frame={frame} media={media} width={width} />
    </div>
  );
}

/** Mídia da capa de blog (1200×630): metade direita. */
export function BlogMedia({ media, frame }: { media: LoadedMedia; frame: Frame }): ReactElement {
  const BH = 630;
  if (media.kind === 'photo') {
    // eslint-disable-next-line @next/next/no-img-element -- arte do Satori, não é página
    return <img src={media.src} width={480} height={BH} alt="" style={{ position: 'absolute', right: 0, top: 0, objectFit: 'cover' }} />;
  }
  if (media.kind === 'mockup') {
    const ratio = media.width / media.height;
    const h = Math.min(BH + 40, 560 / ratio);
    return (
      // eslint-disable-next-line @next/next/no-img-element -- arte do Satori, não é página
      <img src={media.src} width={Math.round(h * ratio)} height={Math.round(h)} alt="" style={{ position: 'absolute', left: 700, top: Math.round((BH - h) / 2 + 40) }} />
    );
  }
  const width = frame === 'celular' ? 240 : 580;
  const top = frame === 'celular' ? 110 : Math.max(60, Math.round((BH - frameHeight(frame, width, media)) / 2) + 30);
  return (
    <div style={abs({ left: frame === 'celular' ? 860 : 700, top })}>
      <DeviceFrame frame={frame} media={media} width={width} />
    </div>
  );
}
