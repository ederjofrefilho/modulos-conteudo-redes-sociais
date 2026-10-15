import { IMAGE_PALETTE as P, labeledLines, type ImageFields } from '@app/content/image-templates';
import { ArrowSquare, Canvas, Label, MONO, Rich, TopBar, UI, abs, lines, str, toneOf, type ThemeName, type Tone } from './art-parts';
import type { LoadedImage } from './media';

/**
 * Peças de dado do brand book da marca (14/10/2026), tiradas do anúncio de
 * 24 s: o balão com a pergunta real do dono (sigla da área + pergunta) e o
 * card branco de painel (rótulo mono + valor grande em reais). Mesma moldura
 * das outras peças: logo e traços de página no topo, margem de 88 px.
 */

type Props = { fields: ImageFields; logo: LoadedImage };

const M = 88;
const TEXT_W = 1080 - 2 * M;
const BODY_TOP = 220;

function Heading({ f, tone, size = 60 }: { f: ImageFields; tone: Tone; size?: number }) {
  if (!f.label && !f.title) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {f.label ? (
        <div style={{ display: 'flex', marginBottom: 28 }}>
          <Label text={str(f.label)} tone={tone} />
        </div>
      ) : null}
      {f.title ? <Rich text={str(f.title)} size={size} letterSpacing={-0.3} color={tone.ink} width={TEXT_W} /> : null}
    </div>
  );
}

/** Sigla da área em mono, numa pílula de contorno dentro do balão. */
function Tag({ text, tone }: { text: string; tone: Tone }) {
  return (
    <div
      style={{
        display: 'flex',
        flexShrink: 0,
        padding: '8px 16px',
        border: `1.5px solid ${tone.line}`,
        borderRadius: 999,
        fontFamily: MONO,
        fontSize: 26,
        letterSpacing: 3,
        textTransform: 'uppercase',
        color: tone.tealInk,
      }}
    >
      {text}
    </div>
  );
}

/** Balões alternam o lado, como uma conversa de reunião. */
export function SocialQuestion({ fields: f, logo }: Props) {
  const theme = f.theme as ThemeName;
  const tone = toneOf(theme);
  const questions = labeledLines(str(f.questions));
  const size = questions.length <= 2 ? 46 : 40;
  const bubbleW = TEXT_W - 120;
  return (
    <Canvas theme={theme}>
      <TopBar f={f} tone={tone} logo={logo} />
      {/* Centrado na altura livre: com poucas perguntas a peça não fica com um vazio embaixo. */}
      <div style={abs({ left: M, top: BODY_TOP, bottom: f.subtitle ? 320 : M + 60, width: TEXT_W, flexDirection: 'column', justifyContent: 'center' })}>
        <Heading f={f} tone={tone} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 36, marginTop: f.title || f.label ? 72 : 0 }}>
          {questions.map((q, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                alignSelf: i % 2 ? 'flex-end' : 'flex-start',
                gap: 26,
                maxWidth: bubbleW,
                padding: '32px 44px',
                borderRadius: 56,
                backgroundColor: tone.card,
                border: `1.5px solid ${tone.cardBorder}`,
                ...(theme === 'escuro' ? {} : { boxShadow: P.shadow.card }),
              }}
            >
              {q.tag ? <Tag text={q.tag} tone={tone} /> : null}
              <Rich text={q.text} size={size} lineHeight={1.2} color={tone.ink} />
            </div>
          ))}
        </div>
      </div>
      {f.subtitle ? (
        <div style={abs({ left: M, bottom: M + 8, width: f.arrow === 'sim' ? TEXT_W - 150 : TEXT_W })}>
          <Rich text={str(f.subtitle)} size={52} letterSpacing={-0.3} color={tone.ink} width={f.arrow === 'sim' ? TEXT_W - 150 : TEXT_W} />
        </div>
      ) : null}
      {f.arrow === 'sim' ? <ArrowSquare tone={tone} /> : null}
    </Canvas>
  );
}

/**
 * Escala da peça de números para caber entre a barra do topo e o rodapé. Com
 * rótulo, título de duas linhas, três cards e legenda o conteúdo passava da
 * altura livre e, centrado, vazava para os dois lados: o rótulo subia para
 * cima do logo e a legenda descia sobre a fonte. Encolhe título, valores,
 * respiros e legenda juntos, em passos de 5%, até caber.
 */
export function numberScale(f: ImageFields, cards: Array<{ text: string }>): number {
  const valueSize = cards.length === 1 ? 144 : cards.length === 2 ? 108 : 88;
  const free = 1350 - BODY_TOP - (M + 60);
  const capW = f.arrow === 'sim' ? TEXT_W - 150 : TEXT_W;
  const height = (s: number) => {
    const head = f.label || f.title;
    let h = f.label ? 26 + 28 : 0;
    if (f.title) h += lines(str(f.title), 60 * s, TEXT_W) * 60 * s * 1.15;
    if (head) h += 64 * s;
    for (const c of cards) h += 88 * s + 34 + 20 * s + lines(c.text, valueSize * s, TEXT_W - 104, 0.6) * valueSize * s;
    h += 28 * s * Math.max(0, cards.length - 1);
    if (f.caption) h += 48 * s + lines(str(f.caption), 48 * s, capW) * 48 * s * 1.15;
    return h;
  };
  let s = 1;
  while (s > 0.6 && height(s) > free) s = Math.round((s - 0.05) * 100) / 100;
  return s;
}

/** Card branco de painel, nos dois temas: no escuro ele é a "tela" que responde. */
export function SocialNumber({ fields: f, logo }: Props) {
  const theme = f.theme as ThemeName;
  const tone = toneOf(theme);
  const cards = labeledLines(str(f.cards));
  const s = numberScale(f, cards);
  const px = (n: number) => Math.round(n * s);
  const valueSize = px(cards.length === 1 ? 144 : cards.length === 2 ? 108 : 88);
  // A legenda não passa por baixo do quadrado com seta, no canto inferior direito.
  const capW = f.arrow === 'sim' ? TEXT_W - 150 : TEXT_W;
  return (
    <Canvas theme={theme}>
      <TopBar f={f} tone={tone} logo={logo} />
      <div style={abs({ left: M, top: BODY_TOP, bottom: M + 60, width: TEXT_W, flexDirection: 'column', justifyContent: 'center' })}>
        <Heading f={f} tone={tone} size={px(60)} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: px(28), marginTop: f.title || f.label ? px(64) : 0 }}>
          {cards.map((c, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: px(20),
                padding: `${px(44)}px 52px`,
                borderRadius: 28,
                backgroundColor: P.sheet,
                border: `1.5px solid ${P.light.cardBorder}`,
                boxShadow: P.shadow.card,
              }}
            >
              <div style={{ display: 'flex', fontFamily: MONO, fontSize: 26, letterSpacing: 3, textTransform: 'uppercase', color: P.light.inkSubtle }}>
                {c.tag ?? ''}
              </div>
              <Rich text={c.text} size={valueSize} weight={600} lineHeight={1} letterSpacing={-valueSize / 40} color={P.light.ink} width={TEXT_W - 104} />
            </div>
          ))}
        </div>
        {f.caption ? (
          <div style={{ display: 'flex', marginTop: px(48) }}>
            <Rich text={str(f.caption)} size={px(48)} letterSpacing={-0.3} color={tone.ink} width={capW} />
          </div>
        ) : null}
      </div>
      {f.source ? (
        <div style={abs({ left: M, bottom: M, width: TEXT_W - 140, fontFamily: UI, fontSize: 20, color: tone.inkSubtle })}>{`Fonte: ${str(f.source)}`}</div>
      ) : null}
      {f.arrow === 'sim' ? <ArrowSquare tone={tone} /> : null}
    </Canvas>
  );
}
