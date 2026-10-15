import type { ReactElement } from 'react';
import {
  IMAGE_PALETTE as P,
  bulletLines,
  plainRich,
  type ImageFields,
  type ImageTemplateId,
} from '@app/content/image-templates';
import { ArrowSquare, Canvas, Label, Logo, MONO, Rich, TopBar, UI, abs, lines, str, toneOf, type Frame, type ThemeName, type Tone } from './art-parts';
import { BlogMedia, MediaArea } from './art-media';
import { SocialNumber, SocialQuestion } from './art-data';
import type { LoadedImage, LoadedMedia } from './media';

/**
 * Arte de cada modelo (JSX do Satori/`next/og`), no padrão do design system
 * "marca" e dos carrosséis
 * já publicados à mão: logo no canto superior esquerdo e traços de
 * página à direita em toda peça, margem lateral de 88 px, IBM Plex Sans nos
 * títulos (400, ênfase em 600), Inter nos rótulos, teal só como acento, logo
 * de verdade (nunca escrita em texto) e mockup como protagonista, grande e
 * sangrando pela borda. Cores vêm de `IMAGE_PALETTE`.
 */

export type ArtInput = { fields: ImageFields; media?: LoadedMedia; logo: LoadedImage };

const W = 1080;
const H = 1350;
const M = 88;
const TEXT_W = W - 2 * M;
/** Onde o conteúdo começa abaixo da barra do topo: igual em toda a sequência. */
const BODY_TOP = 220;

type Body = { number?: string; label?: string; title: string; subtitle?: string; bullets?: string[]; titleSize?: number };

function bodyOf(f: ImageFields, titleSize = 60): Body {
  return {
    number: str(f.number) || undefined,
    label: str(f.label) || undefined,
    title: str(f.title),
    subtitle: str(f.subtitle) || undefined,
    bullets: f.bullets ? bulletLines(str(f.bullets)) : undefined,
    titleSize,
  };
}

function bodyHeight(b: Body): number {
  const size = b.titleSize ?? 60;
  let h = 0;
  if (b.number) h += 216 + 48;
  if (b.label) h += 26 + 28;
  h += lines(b.title, size, TEXT_W) * size * 1.15 + (b.title.includes('==') ? 8 : 0);
  if (b.subtitle) h += 24 + lines(b.subtitle, 30, TEXT_W, 0.47) * 30 * 1.4;
  if (b.bullets?.length) h += 48 + b.bullets.reduce((acc, l) => acc + lines(l, 26, TEXT_W - 34, 0.5) * 36 + 22, 0);
  return Math.round(h);
}

/** Bloco de texto da peça: numeral, rótulo, título, subtítulo e lista — só o que existir. */
function BodyBlock({ b, f, tone, top }: { b: Body; f: ImageFields; tone: Tone; top: number }) {
  const dash = P.bullet[(str(f.bulletTone) || 'teal') as keyof typeof P.bullet] ?? P.teal;
  return (
    <div style={abs({ left: M, top, width: TEXT_W, flexDirection: 'column' })}>
      {b.number ? (
        <div style={{ display: 'flex', height: 216, marginBottom: 48, fontSize: 240, fontWeight: 600, lineHeight: 0.9, letterSpacing: -8, color: tone.numeral }}>
          {b.number}
        </div>
      ) : null}
      {b.label ? <div style={{ display: 'flex', marginBottom: 28 }}><Label text={b.label} tone={tone} /></div> : null}
      <Rich text={b.title} size={b.titleSize ?? 60} letterSpacing={-0.3} color={tone.ink} width={TEXT_W} />
      {b.subtitle ? (
        <div style={{ display: 'flex', marginTop: 24, fontSize: 30, fontWeight: 300, lineHeight: 1.4, color: tone.inkMuted }}>{b.subtitle}</div>
      ) : null}
      {b.bullets?.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 48 }}>
          {b.bullets.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 18, fontSize: 26, lineHeight: 1.38, color: tone.inkMuted }}>
              <div style={{ display: 'flex', width: 16, height: 4, marginTop: 16, flexShrink: 0, backgroundColor: dash }} />
              <div style={{ display: 'flex', width: TEXT_W - 34 }}>{item}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Capa, slide e mockup em destaque: o mesmo esqueleto, mudam o tamanho do título e o fôlego. */
function Piece({ fields: f, media, logo, variant }: ArtInput & { variant: 'cover' | 'slide' | 'mockup' }) {
  const theme = f.theme as ThemeName;
  const tone = toneOf(theme);
  // Capa sem mídia: título maior e centrado na altura, para a peça não ficar com um vazio embaixo.
  const coverAlone = variant === 'cover' && !media;
  const b = bodyOf(f, coverAlone ? 72 : variant === 'mockup' ? 56 : 60);
  const top = coverAlone ? Math.round((H - bodyHeight(b)) / 2) : variant === 'cover' ? 260 : BODY_TOP;
  return (
    <Canvas theme={theme}>
      <TopBar f={f} tone={tone} logo={logo} />
      <BodyBlock b={b} f={f} tone={tone} top={top} />
      {media ? <MediaArea media={media} frame={f.frame as Frame} top={top + bodyHeight(b) + 64} W={W} H={H} M={M} /> : null}
      {f.arrow === 'sim' ? <ArrowSquare tone={tone} /> : null}
    </Canvas>
  );
}

function SocialStat({ fields: f, logo }: ArtInput) {
  const theme = f.theme as ThemeName;
  const tone = toneOf(theme);
  const value = str(f.value);
  const size = value.length <= 4 ? 260 : value.length <= 7 ? 200 : 150;
  return (
    <Canvas theme={theme}>
      <TopBar f={f} tone={tone} logo={logo} />
      <div style={abs({ left: M, top: BODY_TOP + 60, width: TEXT_W, flexDirection: 'column' })}>
        {f.label ? <div style={{ display: 'flex', marginBottom: 40 }}><Label text={str(f.label)} tone={tone} /></div> : null}
        <div style={{ display: 'flex', fontSize: size, fontWeight: 600, lineHeight: 0.9, letterSpacing: -size / 30, color: tone.ink }}>{value}</div>
        <div style={{ display: 'flex', width: 120, height: 8, marginTop: 56, marginBottom: 48, backgroundColor: P.teal }} />
        <Rich text={str(f.caption)} size={48} letterSpacing={-0.3} color={tone.ink} width={TEXT_W} />
      </div>
      {f.source ? (
        <div style={abs({ left: M, bottom: M, width: TEXT_W - 140, fontFamily: UI, fontSize: 20, color: tone.inkSubtle })}>{`Fonte: ${str(f.source)}`}</div>
      ) : null}
      {f.arrow === 'sim' ? <ArrowSquare tone={tone} /> : null}
    </Canvas>
  );
}

function SocialQuote({ fields: f, logo }: ArtInput) {
  const theme = f.theme as ThemeName;
  const tone = toneOf(theme);
  const quote = str(f.quote);
  const size = plainRich(quote).length <= 90 ? 64 : 54;
  return (
    <Canvas theme={theme}>
      <TopBar f={f} tone={tone} logo={logo} />
      <div style={abs({ left: M, top: BODY_TOP + 40, width: TEXT_W, flexDirection: 'column' })}>
        <div style={{ display: 'flex', height: 120, fontSize: 220, fontWeight: 600, lineHeight: 0.9, color: tone.tealInk }}>“</div>
        <Rich text={quote} size={size} lineHeight={1.18} letterSpacing={-0.3} color={tone.ink} width={TEXT_W} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 56, fontFamily: UI }}>
          <div style={{ display: 'flex', fontSize: 24, fontWeight: 600, color: tone.ink }}>{str(f.author)}</div>
          {f.role ? <div style={{ display: 'flex', fontSize: 22, color: tone.inkSubtle }}>{str(f.role)}</div> : null}
        </div>
      </div>
    </Canvas>
  );
}

function SocialCta({ fields: f, media, logo }: ArtInput) {
  const theme = f.theme as ThemeName;
  const tone = toneOf(theme);
  const b = bodyOf(f, 62);
  const top = 200;
  const buttonTop = top + bodyHeight(b) + 52;
  const buttonBlock = f.url ? 150 : 100;
  return (
    <Canvas theme={theme}>
      <BodyBlock b={b} f={f} tone={tone} top={top} />
      <CtaButton f={f} theme={theme} tone={tone} top={buttonTop} />
      {media ? <MediaArea media={media} frame={f.frame as Frame} top={Math.max(buttonTop + buttonBlock + 50, 560)} W={W} H={H} M={M} rotatePhone /> : null}
      <Logo logo={logo} height={50} style={{ position: 'absolute', left: M, bottom: M }} />
    </Canvas>
  );
}

/** Capa de blog (1200×630): título à esquerda, mídia à direita sangrando. */
function BlogCover({ fields: f, media, logo }: ArtInput) {
  const theme = f.theme as ThemeName;
  const tone = toneOf(theme);
  const title = str(f.title);
  const textW = media ? 600 : 1072;
  const size = plainRich(title).length <= 50 ? 56 : 48;
  return (
    <Canvas theme={theme}>
      <Logo logo={logo} height={40} style={{ position: 'absolute', left: 64, top: 64 }} />
      <div style={abs({ left: 64, top: 0, bottom: 0, width: textW, flexDirection: 'column', justifyContent: 'center', paddingTop: 40 })}>
        {f.category ? <div style={{ display: 'flex', marginBottom: 28 }}><Label text={str(f.category)} tone={tone} /></div> : null}
        <Rich text={title} size={size} letterSpacing={-0.5} color={tone.ink} width={textW} />
      </div>
      {media ? <BlogMedia media={media} frame={f.frame as Frame} /> : null}
    </Canvas>
  );
}

/**
 * Botão da chamada: contorno verde-água (padrão) ou pílula cheia com seta →
 * (brand book de 14/10/2026). Cheio é preto no claro e branco no escuro. O
 * endereço, quando há, sai em mono caixa alta logo abaixo.
 */
function CtaButton({ f, theme, tone, top }: { f: ImageFields; theme: ThemeName; tone: Tone; top: number }) {
  const solid = f.buttonStyle === 'cheio';
  const dark = theme === 'escuro';
  const fill = dark ? P.sheet : P.light.ink;
  const ink = dark ? P.light.ink : P.sheet;
  return (
    <div style={abs({ left: M, top, flexDirection: 'column', alignItems: 'flex-start', gap: 28 })}>
      {solid ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '22px 40px', borderRadius: 999, backgroundColor: fill, fontSize: 28, color: ink }}>
          <span>{str(f.button)}</span>
          <span style={{ fontSize: 30 }}>→</span>
        </div>
      ) : (
        <div style={{ display: 'flex', padding: '20px 40px', border: `2.5px solid ${P.teal}`, borderRadius: 999, fontSize: 28, color: tone.ink }}>
          {str(f.button)}
        </div>
      )}
      {f.url ? (
        <div style={{ display: 'flex', fontFamily: MONO, fontSize: 24, letterSpacing: 3, textTransform: 'uppercase', color: tone.inkSubtle }}>{str(f.url)}</div>
      ) : null}
    </div>
  );
}

const ART: Record<ImageTemplateId, (props: ArtInput) => ReactElement> = {
  'social-cover': (p) => <Piece {...p} variant="cover" />,
  'social-slide': (p) => <Piece {...p} variant="slide" />,
  'social-mockup': (p) => <Piece {...p} variant="mockup" />,
  'social-stat': SocialStat,
  'social-quote': SocialQuote,
  'social-cta': SocialCta,
  'social-question': SocialQuestion,
  'social-number': SocialNumber,
  'blog-cover': BlogCover,
};

export function artFor(template: ImageTemplateId, input: ArtInput): ReactElement {
  const Art = ART[template];
  return <Art {...input} />;
}

/** Fundo escuro pede a logo branca. */
export function isDark(fields: ImageFields): boolean {
  return fields.theme === 'escuro';
}
