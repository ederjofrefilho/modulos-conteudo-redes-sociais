import { z } from 'zod';

/**
 * Modelos de imagem do conteúdo (Etapa 1 de `docs/PLANO-REDES-SOCIAIS.md`,
 * redesenhados em 10/10/2026 no design system da marca aprovado em
 * 23/09/2026: 
 *
 * Só a DEFINIÇÃO de cada modelo mora aqui: tamanho, campos, limite de
 * caracteres, paleta e o catálogo de mockups/prints. Quem desenha é
 * `apps/web/src/lib/content-images` (`next/og`), quem guarda é `service.ts`.
 * O texto vem pronto do Claude ou de quem preenche a tela; preencher um molde
 * fixo é conversão de formato, nunca decisão de conteúdo (princípio 2).
 *
 * Arquivo puro (só zod), exposto no subpath `@app/content/image-templates`
 * para o navegador montar o formulário sem puxar o Prisma do índice.
 */

export type ImageTemplateId =
  | 'social-cover'
  | 'social-slide'
  | 'social-stat'
  | 'social-quote'
  | 'social-mockup'
  | 'social-cta'
  | 'social-question'
  | 'social-number'
  | 'blog-cover';

/** Para onde a imagem vai — rede social exige JPEG (Instagram não aceita outro). */
export type ImageTarget = 'blog' | 'social';

export type MediaKind = 'mockup' | 'print' | 'photo';

export interface ImageFieldSpec {
  name: string;
  label: string;
  /**
   * `text`: string com limite de caracteres (`rich` aceita **negrito**,
   * ==marca-texto== e !!carmim!!, que não contam no limite); `int`: inteiro entre min e
   * max; `choice`: um dos `options`; `media`: id do catálogo `BRAND_MEDIA` ou
   * de uma imagem da biblioteca de conteúdo.
   */
  kind: 'text' | 'int' | 'choice' | 'media';
  max?: number;
  min?: number;
  optional?: boolean;
  multiline?: boolean;
  rich?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  default?: string;
  accepts?: MediaKind[];
  hint?: string;
}

export interface ImageTemplateSpec {
  id: ImageTemplateId;
  label: string;
  description: string;
  width: number;
  height: number;
  target: ImageTarget;
  fields: ImageFieldSpec[];
}

/**
 * Cores do design system (tokens.json), por tema. Ficam aqui, e não no app,
 * porque o Satori não lê variável CSS e o `design-guards` proíbe cor literal
 * em `apps/web/src`: a imagem é um arquivo, não uma tela com tema.
 * O fundo escuro é quase preto com um brilho azul longo no canto inferior
 * direito (`glow`): quem olha precisa ler "preto". Teal nunca é fundo.
 */
export const IMAGE_PALETTE = {
  sheet: '#FFFFFF',
  teal: '#2ECFC0',
  /** Carmim do brand book (14/10/2026): a palavra da dor, o número negativo. Nunca fundo. */
  signalRed: '#E23B3B',
  /** Texto sobre o marca-texto teal, nos dois temas. */
  onTeal: '#0A0A0A',
  /** Traço dos itens de lista, por intenção: dor, atenção, neutro, solução. */
  bullet: { vermelho: '#E23B3B', amarelo: '#E0A410', azul: '#2563EB', teal: '#2ECFC0' },
  light: {
    bg: '#F6F6F3',
    glow: '#E9E9E5',
    ink: '#0A0A0A',
    inkMuted: '#3A3A3A',
    inkSubtle: '#6B6B6B',
    line: '#DDDDD8',
    tealInk: '#0B7D73',
    dot: '#E1E1DD',
    card: '#FFFFFF',
    cardBorder: '#EDEDED',
    arrowBg: '#000000',
    arrowFg: '#FFFFFF',
    numeral: '#2B2B2B',
  },
  dark: {
    bg: '#030407',
    glow: '#0D1633',
    ink: '#FFFFFF',
    inkMuted: '#C9CED8',
    inkSubtle: '#8F96A6',
    line: '#262C3B',
    tealInk: '#2ECFC0',
    dot: '#2A303D',
    card: '#11172A',
    cardBorder: '#232A3D',
    arrowBg: '#11172A',
    arrowFg: '#FFFFFF',
    numeral: '#6B7280',
  },
  /** Moldura desenhada em volta de um print (notebook, tablet, celular). */
  device: {
    bezel: '#0E0F12',
    bezelEdge: '#2A2D34',
    body: '#C9CCD2',
    bodyShade: '#A9ADB5',
    browserBar: '#ECECEA',
    browserDot: '#C4C4C0',
  },
  shadow: {
    card: '0 10px 30px rgba(15,20,40,0.08)',
    device: '0 40px 80px rgba(3,4,7,0.30)',
  },
} as const;

/**
 * Biblioteca de mockups e prints de painéis que vem com o CRM (arquivos em
 * `apps/web/public/conteudo-midia`, miniaturas em `.../miniaturas`). Origem:
 * os três mockups aprovados no design system, as imagens do example.com e
 * os mockups de MacBook do Figma do brand book (14/10/2026), recortados sem o
 * título e a logo que vinham no slide, para não duplicar os da peça.
 * - `mockup`: aparelho já fotografado, PNG com fundo transparente, entra
 *   inteiro e sangrando pela borda;
 * - `print`: tela plana de um painel; a arte desenha um aparelho em volta
 *   (notebook, navegador, tablet, celular) — é o que gera mockup novo;
 * - `photo`: foto com fundo próprio, ocupa a faixa inferior da peça.
 * Uma imagem enviada para a biblioteca de conteúdo também serve (pelo id do
 * asset) e é tratada como `print`.
 */
export interface BrandMedia {
  id: string;
  label: string;
  kind: MediaKind;
  file: string;
  width: number;
  height: number;
  description: string;
}

export const BRAND_MEDIA: BrandMedia[] = [
  {
    id: 'mockup-notebook-site',
    label: 'Notebook com o site',
    kind: 'mockup',
    file: 'mockup-notebook-site.png',
    width: 1400,
    height: 1241,
    description: 'Notebook em ângulo com a home do site da marca (fundo escuro na tela).',
  },
  {
    id: 'mockup-tablet-dashboard',
    label: 'Tablet com painel de vendas',
    kind: 'mockup',
    file: 'mockup-tablet-dashboard.png',
    width: 1250,
    height: 1403,
    description: 'Tablet na mão com o painel de performance de vendas.',
  },
  {
    id: 'mockup-celular-diagnostico',
    label: 'Celular com o diagnóstico',
    kind: 'mockup',
    file: 'mockup-celular-diagnostico.png',
    width: 735,
    height: 1505,
    description: 'Celular com a primeira pergunta do diagnóstico. Natural para chamada ao diagnóstico.',
  },
  {
    id: 'print-painel-vendas',
    label: 'Painel de vendas',
    kind: 'print',
    file: 'print-painel-vendas.jpg',
    width: 2000,
    height: 1136,
    description: 'Performance de vendas: faturamento, margem bruta, vendas e margem ao longo do tempo. Tema escuro.',
  },
  {
    id: 'print-projecao-lucro',
    label: 'Projeção de lucro',
    kind: 'print',
    file: 'print-projecao-lucro.jpg',
    width: 2000,
    height: 1136,
    description: 'Simulador de projeção de lucro (ajuste de preço, custo e vendas) com linha projetado x realizado. Tema escuro.',
  },
  {
    id: 'print-painel-financeiro',
    label: 'Visão geral financeira',
    kind: 'print',
    file: 'print-painel-financeiro.jpg',
    width: 2000,
    height: 1098,
    description: 'Visão geral: receita, custos, despesas e lucro, receita x ano anterior, top 5 clientes. Tema claro.',
  },
  {
    id: 'print-fluxo-caixa',
    label: 'Fluxo de caixa',
    kind: 'print',
    file: 'print-fluxo-caixa.jpg',
    width: 2000,
    height: 1102,
    description: 'Fluxo de caixa mês a mês (cascata) e detalhamento por mês. Tema claro.',
  },
  {
    id: 'foto-tablet-relatorio',
    label: 'Foto: tablet com relatório',
    kind: 'photo',
    file: 'foto-tablet-relatorio.jpg',
    width: 1600,
    height: 1200,
    description: 'Mão segurando tablet com relatório de projeção, fundo cinza claro.',
  },
  {
    id: 'foto-notebook-vendas',
    label: 'Foto: notebook com painel',
    kind: 'photo',
    file: 'foto-notebook-vendas.jpg',
    width: 1600,
    height: 1200,
    description: 'Notebook com painel de vendas sob luz dramática, fundo escuro.',
  },
  {
    id: 'foto-notebook-painel',
    label: 'Foto: notebook com painel (luz)',
    kind: 'photo',
    file: 'foto-notebook-painel.jpg',
    width: 1600,
    height: 1200,
    description: 'Notebook inclinado com o painel de vendas, faixas de luz e sombra, fundo escuro.',
  },
  {
    id: 'foto-notebook-site',
    label: 'Foto: notebook com o site',
    kind: 'photo',
    file: 'foto-notebook-site.jpg',
    width: 1600,
    height: 1200,
    description: 'Notebook com a home do site da marca sob luz dramática, fundo escuro.',
  },
  {
    id: 'foto-macbook-site-pedra',
    label: 'Foto: MacBook com o site (pedra)',
    kind: 'photo',
    file: 'foto-macbook-site-pedra.jpg',
    width: 1208,
    height: 1080,
    description: 'MacBook com a home do site da marca sobre uma prateleira de pedra, luz lateral, fundo escuro.',
  },
  {
    id: 'foto-macbook-site-banner',
    label: 'Foto: MacBook com o site (faixa larga)',
    kind: 'photo',
    file: 'foto-macbook-site-banner.jpg',
    width: 1900,
    height: 700,
    description: 'MacBook com a home do site da marca em faixa larga e baixa, fundo escuro. Boa para capa de blog.',
  },
  {
    id: 'foto-camadas-dados',
    label: 'Foto: camadas de dados',
    kind: 'photo',
    file: 'foto-camadas-dados.jpg',
    width: 1536,
    height: 1024,
    description: 'Ilustração 3D de camadas de vidro com dados fluindo (stack de dados), fundo claro.',
  },
];

export const BRAND_MEDIA_BY_ID: Record<string, BrandMedia> = Object.fromEntries(BRAND_MEDIA.map((m) => [m.id, m]));

const THEME_FIELD = (def: 'escuro' | 'claro' | 'branco'): ImageFieldSpec => ({
  name: 'theme',
  label: 'Fundo',
  kind: 'choice',
  default: def,
  options: [
    { value: 'escuro', label: 'Escuro' },
    { value: 'claro', label: 'Off-white' },
    { value: 'branco', label: 'Branco' },
  ],
  hint: 'Sequência abre e fecha no escuro, com o miolo em off-white.',
});

const LABEL_FIELD: ImageFieldSpec = {
  name: 'label',
  label: 'Rótulo',
  kind: 'text',
  max: 40,
  optional: true,
  placeholder: 'Ex.: Estágio 02 · Fragmentado',
  hint: 'Caixa alta acima do título.',
};

const MEDIA_FIELD = (optional: boolean): ImageFieldSpec => ({
  name: 'media',
  label: 'Mockup, print ou foto',
  kind: 'media',
  optional,
  accepts: ['mockup', 'print', 'photo'],
});

const FRAME_FIELD: ImageFieldSpec = {
  name: 'frame',
  label: 'Aparelho em volta do print',
  kind: 'choice',
  default: 'notebook',
  options: [
    { value: 'notebook', label: 'Notebook' },
    { value: 'navegador', label: 'Janela de navegador' },
    { value: 'tablet', label: 'Tablet' },
    { value: 'celular', label: 'Celular' },
    { value: 'nenhum', label: 'Sem aparelho' },
  ],
  hint: 'Só vale para print. Mockup e foto já vêm prontos. Celular pede print vertical (o horizontal é cortado).',
};

const ARROW_FIELD: ImageFieldSpec = {
  name: 'arrow',
  label: 'Quadrado com seta',
  kind: 'choice',
  default: 'nao',
  options: [
    { value: 'nao', label: 'Não' },
    { value: 'sim', label: 'Sim' },
  ],
  hint: 'Indica que a sequência continua. No máximo um por sequência.',
};

const NUMBER_FIELD: ImageFieldSpec = {
  name: 'number',
  label: 'Numeral grande',
  kind: 'text',
  max: 3,
  optional: true,
  placeholder: 'Ex.: 01',
  hint: 'Para sequências numeradas (estágios, passos).',
};

const BULLET_FIELDS: ImageFieldSpec[] = [
  {
    name: 'bullets',
    label: 'Lista',
    kind: 'text',
    max: 240,
    optional: true,
    multiline: true,
    placeholder: 'Um item por linha (até 5)',
    hint: 'Um item por linha, até 5. Frases curtas.',
  },
  {
    name: 'bulletTone',
    label: 'Cor do traço da lista',
    kind: 'choice',
    default: 'teal',
    options: [
      { value: 'vermelho', label: 'Vermelho (dor)' },
      { value: 'amarelo', label: 'Amarelo (atenção)' },
      { value: 'azul', label: 'Azul (neutro)' },
      { value: 'teal', label: 'Verde-água (solução)' },
    ],
  },
];

const PAGE_FIELDS: ImageFieldSpec[] = [
  { name: 'index', label: 'Slide nº', kind: 'int', min: 1, max: 10, optional: true },
  { name: 'total', label: 'Total de slides', kind: 'int', min: 2, max: 10, optional: true },
];

const RICH_HINT =
  'Use **negrito** nas palavras-chave e ==marca-texto== numa frase só. Opcional: !!carmim!! na palavra da dor (vem antes do verde-água).';

/**
 * Botão da chamada (brand book, 14/10/2026): é repertório, não regra. O
 * contorno verde-água continua o padrão; o cheio é a pílula preta com seta →
 * (no fundo escuro ela inverte para branca, senão some).
 */
const BUTTON_STYLE_FIELD: ImageFieldSpec = {
  name: 'buttonStyle',
  label: 'Estilo do botão',
  kind: 'choice',
  default: 'contorno',
  options: [
    { value: 'contorno', label: 'Contorno verde-água' },
    { value: 'cheio', label: 'Cheio, com seta' },
  ],
  hint: 'Varie entre peças. No fundo escuro o cheio sai branco.',
};

/**
 * Logo colorida (pontos e linha em verde-água, carmim e azul) é a versão
 * principal: capas, fechos e painéis. A monocromática fica para foto, mockup
 * ou fundo em que a cor brigue (14/10/2026). A cor da letra segue o tema.
 */
const LOGO_FIELD: ImageFieldSpec = {
  name: 'logo',
  label: 'Logo',
  kind: 'choice',
  default: 'colorida',
  options: [
    { value: 'colorida', label: 'Colorida' },
    { value: 'mono', label: 'Só preta ou branca' },
  ],
  hint: 'Colorida por padrão. Monocromática sobre foto ou mockup que brigue com a cor.',
};

/** Máximo de linhas dos campos de lista (um item por linha). */
const MAX_LINES: Record<string, number> = { bullets: 5, questions: 4, cards: 3 };

export const IMAGE_TEMPLATES: Record<ImageTemplateId, ImageTemplateSpec> = {
  'social-cover': {
    id: 'social-cover',
    label: 'Capa',
    description: 'Abertura de carrossel ou post único: logo, título forte e mockup opcional (1080×1350, 4:5).',
    width: 1080,
    height: 1350,
    target: 'social',
    fields: [
      THEME_FIELD('escuro'),
      LOGO_FIELD,
      LABEL_FIELD,
      { name: 'title', label: 'Título', kind: 'text', max: 110, multiline: true, rich: true, hint: RICH_HINT },
      { name: 'subtitle', label: 'Subtítulo', kind: 'text', max: 160, optional: true, multiline: true },
      MEDIA_FIELD(true),
      FRAME_FIELD,
      ARROW_FIELD,
    ],
  },
  'social-slide': {
    id: 'social-slide',
    label: 'Slide',
    description:
      'Miolo de carrossel: numeral grande, rótulo, título, subtítulo, lista com traço colorido e mídia, todos opcionais menos o título (1080×1350).',
    width: 1080,
    height: 1350,
    target: 'social',
    fields: [
      THEME_FIELD('claro'),
      LOGO_FIELD,
      NUMBER_FIELD,
      LABEL_FIELD,
      { name: 'title', label: 'Título', kind: 'text', max: 110, multiline: true, rich: true, hint: RICH_HINT },
      { name: 'subtitle', label: 'Subtítulo', kind: 'text', max: 220, optional: true, multiline: true },
      ...BULLET_FIELDS,
      MEDIA_FIELD(true),
      FRAME_FIELD,
      ...PAGE_FIELDS,
      ARROW_FIELD,
    ],
  },
  'social-stat': {
    id: 'social-stat',
    label: 'Número',
    description: 'Numeral grande com legenda e fonte (1080×1350).',
    width: 1080,
    height: 1350,
    target: 'social',
    fields: [
      THEME_FIELD('claro'),
      LOGO_FIELD,
      LABEL_FIELD,
      { name: 'value', label: 'Número', kind: 'text', max: 12, placeholder: 'Ex.: 73%' },
      { name: 'caption', label: 'Legenda', kind: 'text', max: 120, multiline: true, rich: true, hint: RICH_HINT },
      { name: 'source', label: 'Fonte', kind: 'text', max: 80, optional: true },
      ...PAGE_FIELDS,
      ARROW_FIELD,
    ],
  },
  'social-quote': {
    id: 'social-quote',
    label: 'Citação',
    description: 'Frase em destaque com autor e cargo (1080×1350).',
    width: 1080,
    height: 1350,
    target: 'social',
    fields: [
      THEME_FIELD('escuro'),
      LOGO_FIELD,
      { name: 'quote', label: 'Frase', kind: 'text', max: 180, multiline: true, rich: true, hint: RICH_HINT },
      { name: 'author', label: 'Autor', kind: 'text', max: 40 },
      { name: 'role', label: 'Cargo ou empresa', kind: 'text', max: 60, optional: true },
      ...PAGE_FIELDS,
    ],
  },
  'social-mockup': {
    id: 'social-mockup',
    label: 'Mockup em destaque',
    description: 'Título curto e o mockup, print ou foto como protagonista, sangrando pela borda (1080×1350).',
    width: 1080,
    height: 1350,
    target: 'social',
    fields: [
      THEME_FIELD('claro'),
      LOGO_FIELD,
      LABEL_FIELD,
      { name: 'title', label: 'Título', kind: 'text', max: 90, multiline: true, rich: true, hint: RICH_HINT },
      { name: 'subtitle', label: 'Subtítulo', kind: 'text', max: 140, optional: true, multiline: true },
      MEDIA_FIELD(false),
      FRAME_FIELD,
      ...PAGE_FIELDS,
    ],
  },
  'social-cta': {
    id: 'social-cta',
    label: 'Chamada (CTA)',
    description: 'Fechamento com pergunta, botão em pílula e mockup opcional (1080×1350).',
    width: 1080,
    height: 1350,
    target: 'social',
    fields: [
      THEME_FIELD('escuro'),
      LOGO_FIELD,
      { name: 'title', label: 'Título', kind: 'text', max: 90, multiline: true, rich: true, hint: RICH_HINT },
      { name: 'subtitle', label: 'Subtítulo', kind: 'text', max: 120, optional: true, multiline: true },
      { name: 'button', label: 'Botão', kind: 'text', max: 32, placeholder: 'Ex.: Faça o diagnóstico' },
      BUTTON_STYLE_FIELD,
      {
        name: 'url',
        label: 'Endereço',
        kind: 'text',
        max: 32,
        optional: true,
        placeholder: 'Ex.: example.com',
        hint: 'Sai em mono, caixa alta, abaixo do botão.',
      },
      MEDIA_FIELD(true),
      FRAME_FIELD,
    ],
  },
  'social-question': {
    id: 'social-question',
    label: 'Perguntas do dono',
    description:
      'Balões de pergunta: pílula com a sigla da área (FIN, COM, OPS) e a pergunta real do dono, com título opcional (1080×1350).',
    width: 1080,
    height: 1350,
    target: 'social',
    fields: [
      THEME_FIELD('escuro'),
      LOGO_FIELD,
      LABEL_FIELD,
      { name: 'title', label: 'Título', kind: 'text', max: 90, optional: true, multiline: true, rich: true, hint: RICH_HINT },
      {
        name: 'questions',
        label: 'Perguntas',
        kind: 'text',
        max: 220,
        multiline: true,
        placeholder: 'FIN: Quanto caixa sobra?\nCOM: Qual produto dá lucro?',
        hint: 'Uma por linha, até 4. Sigla de até 4 letras antes dos dois-pontos (opcional).',
      },
      { name: 'subtitle', label: 'Fecho', kind: 'text', max: 120, optional: true, multiline: true, rich: true, hint: 'Ex.: Três planilhas. !!Três respostas.!!' },
      ...PAGE_FIELDS,
      ARROW_FIELD,
    ],
  },
  'social-number': {
    id: 'social-number',
    label: 'Cards de número',
    description: 'Cards brancos com rótulo mono e um valor grande em reais, como num painel (1080×1350).',
    width: 1080,
    height: 1350,
    target: 'social',
    fields: [
      THEME_FIELD('claro'),
      LOGO_FIELD,
      LABEL_FIELD,
      { name: 'title', label: 'Título', kind: 'text', max: 90, optional: true, multiline: true, rich: true, hint: RICH_HINT },
      {
        name: 'cards',
        label: 'Cards',
        kind: 'text',
        max: 160,
        multiline: true,
        placeholder: 'Faturamento: R$ 412.380\nMargem: 31,8%',
        hint: 'Um por linha, até 3, "Rótulo: valor". Valor aceita !!carmim!! (negativo) e ==verde-água==. Número de tela é ilustração.',
      },
      { name: 'caption', label: 'Legenda', kind: 'text', max: 120, optional: true, multiline: true, rich: true, hint: RICH_HINT },
      { name: 'source', label: 'Fonte', kind: 'text', max: 80, optional: true },
      ...PAGE_FIELDS,
      ARROW_FIELD,
    ],
  },
  'blog-cover': {
    id: 'blog-cover',
    label: 'Capa de blog',
    description: 'Capa de artigo ou caso de sucesso (1200×630, também vira imagem de compartilhamento).',
    width: 1200,
    height: 630,
    target: 'blog',
    fields: [
      THEME_FIELD('claro'),
      LOGO_FIELD,
      { name: 'title', label: 'Título', kind: 'text', max: 90, multiline: true, rich: true, hint: RICH_HINT },
      { name: 'category', label: 'Categoria', kind: 'text', max: 28, optional: true, placeholder: 'Ex.: Engenharia de dados' },
      MEDIA_FIELD(true),
      FRAME_FIELD,
    ],
  },
};

export const IMAGE_TEMPLATE_IDS = Object.keys(IMAGE_TEMPLATES) as [ImageTemplateId, ...ImageTemplateId[]];

/**
 * Nomes dos modelos de antes do redesenho (Etapa 1). Continuam aceitos —
 * rascunhos e prompts antigos chamam por eles — e caem no modelo novo
 * equivalente, com o campo renomeado quando mudou.
 */
export const TEMPLATE_ALIASES: Record<string, { to: ImageTemplateId; rename?: Record<string, string> }> = {
  'ig-quote': { to: 'social-quote' },
  'ig-stat': { to: 'social-stat' },
  'ig-carousel-slide': { to: 'social-slide', rename: { body: 'subtitle' } },
  'li-card': { to: 'social-cover' },
};

export const TEMPLATE_INPUT_IDS = [...IMAGE_TEMPLATE_IDS, ...Object.keys(TEMPLATE_ALIASES)] as [string, ...string[]];

/** Resolve um nome (novo ou antigo) para o modelo atual, renomeando campos de alias. */
export function resolveTemplate(
  template: string,
  fields: Record<string, unknown> = {},
): { template: ImageTemplateId; fields: Record<string, unknown> } | null {
  if (isImageTemplateId(template)) return { template, fields };
  const alias = TEMPLATE_ALIASES[template];
  if (!alias) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[alias.rename?.[k] ?? k] = v;
  return { template: alias.to, fields: out };
}

// ---------- texto com ênfase ----------

export type RichSegment = { text: string; style: 'normal' | 'bold' | 'mark' | 'pain' };

/**
 * `**negrito**` (IBM Plex Sans 600 nas palavras-chave), `==marca-texto==`
 * (bloco teal atrás da frase-chave) e `!!carmim!!` (a palavra da dor em
 * carmim, 600; brand book de 14/10/2026). Marcador sem par fica como texto.
 */
export function parseRich(text: string): RichSegment[] {
  const out: RichSegment[] = [];
  const re = /\*\*(.+?)\*\*|==(.+?)==|!!(.+?)!!/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), style: 'normal' });
    out.push(
      m[1] !== undefined
        ? { text: m[1], style: 'bold' }
        : m[2] !== undefined
          ? { text: m[2], style: 'mark' }
          : { text: m[3]!, style: 'pain' },
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), style: 'normal' });
  return out.filter((s) => s.text.length > 0);
}

/** Texto visível, sem os marcadores — é o que conta no limite e vai no alt. */
export function plainRich(text: string): string {
  return parseRich(text)
    .map((s) => s.text)
    .join('');
}

/**
 * Linha "Rótulo: texto" dos balões de pergunta e dos cards de número. O
 * rótulo só conta quando é curto (até 24 caracteres) e vem antes de ": ",
 * para "10:30" ou uma pergunta com dois-pontos no meio não virar rótulo.
 */
export function labeledLines(text: string): Array<{ tag: string | null; text: string }> {
  return bulletLines(text).map((line) => {
    const i = line.indexOf(': ');
    if (i > 0 && i <= 24) return { tag: line.slice(0, i).trim(), text: line.slice(i + 2).trim() };
    return { tag: null, text: line };
  });
}

/** Itens da lista: uma linha cada, sem marcador digitado ("-", "•") nem linha vazia. */
export function bulletLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•*–]\s*/, '').trim())
    .filter(Boolean);
}

// ---------- validação ----------

/** Id de asset da biblioteca (cuid do Prisma). */
const ASSET_ID = /^c[a-z0-9]{20,32}$/;

function fieldSchema(field: ImageFieldSpec): z.ZodTypeAny {
  if (field.kind === 'int') {
    const n = z.coerce
      .number({ invalid_type_error: `${field.label}: informe um número` })
      .int(`${field.label}: use um número inteiro`)
      .min(field.min ?? 0, `${field.label}: mínimo ${field.min ?? 0}`)
      .max(field.max ?? Number.MAX_SAFE_INTEGER, `${field.label}: máximo ${field.max}`);
    // Formulário manda "" para número vazio.
    return field.optional ? z.preprocess((v) => (v === '' || v === null ? undefined : v), n.optional()) : n;
  }
  if (field.kind === 'choice') {
    const values = field.options!.map((o) => o.value) as [string, ...string[]];
    return z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? field.default : v),
      z.enum(values, { errorMap: () => ({ message: `${field.label}: use ${values.join(', ')}` }) }),
    );
  }
  if (field.kind === 'media') {
    const s = z
      .string()
      .trim()
      .refine((v) => !v || v in BRAND_MEDIA_BY_ID || ASSET_ID.test(v), {
        message: `${field.label}: use um id do catálogo (${BRAND_MEDIA.map((m) => m.id).join(', ')}) ou o id de uma imagem da biblioteca`,
      })
      .refine(
        (v) => !v || !(v in BRAND_MEDIA_BY_ID) || (field.accepts ?? []).includes(BRAND_MEDIA_BY_ID[v]!.kind),
        { message: `${field.label}: tipo de mídia não aceito neste modelo` },
      );
    if (field.optional) return s.optional().transform((v) => (v ? v : undefined));
    return s.refine((v) => v.length > 0, `${field.label} é obrigatório`);
  }
  const max = field.max ?? 0;
  let s: z.ZodTypeAny = z
    .string()
    .trim()
    .refine((v) => (field.rich ? plainRich(v) : v).length <= max, {
      message: `${field.label}: no máximo ${max} caracteres (a arte não comporta mais)`,
    });
  if (field.rich) {
    s = s.refine((v: string) => parseRich(v).filter((x) => x.style === 'mark').length <= 1, {
      message: `${field.label}: no máximo um ==marca-texto==`,
    });
    s = s.refine((v: string) => parseRich(v).filter((x) => x.style === 'pain').length <= 1, {
      message: `${field.label}: no máximo um !!carmim!! (a palavra da dor)`,
    });
  }
  if (field.optional) {
    // Campo opcional vazio vira ausente — a arte só desenha o que existe.
    return s.optional().transform((v: string | undefined) => (v ? v : undefined));
  }
  return s.refine((v: string) => v.length > 0, `${field.label} é obrigatório`);
}

const templateSchemas = Object.fromEntries(
  IMAGE_TEMPLATE_IDS.map((id) => {
    const spec = IMAGE_TEMPLATES[id];
    let schema: z.ZodTypeAny = z.object(Object.fromEntries(spec.fields.map((f) => [f.name, fieldSchema(f)])));
    for (const f of spec.fields) {
      const max = MAX_LINES[f.name];
      if (!max) continue;
      schema = schema.refine((v) => !v[f.name] || bulletLines(String(v[f.name])).length <= max, {
        message: `${f.label}: no máximo ${max} itens`,
        path: [f.name],
      });
    }
    if (spec.fields.some((f) => f.name === 'questions')) {
      schema = schema.refine((v) => labeledLines(String(v.questions ?? '')).every((q) => !q.tag || q.tag.length <= 4), {
        message: 'Perguntas: a sigla tem até 4 letras (FIN, COM, OPS)',
        path: ['questions'],
      });
    }
    if (spec.fields.some((f) => f.name === 'cards')) {
      schema = schema.refine((v) => labeledLines(String(v.cards ?? '')).every((c) => c.tag && c.text), {
        message: 'Cards: escreva cada um como "Rótulo: valor"',
        path: ['cards'],
      });
    }
    if (spec.fields.some((f) => f.name === 'index')) {
      schema = schema
        .refine((v) => (v.index === undefined) === (v.total === undefined), {
          message: 'Informe o número do slide e o total juntos (ou nenhum dos dois)',
          path: ['index'],
        })
        .refine((v) => v.index === undefined || v.total === undefined || v.index <= v.total, {
          message: 'O número do slide não pode passar do total',
          path: ['index'],
        });
    }
    return [id, schema];
  }),
) as Record<ImageTemplateId, z.ZodTypeAny>;

export type ImageFields = Record<string, string | number | undefined>;

/** Valida os campos de um modelo. Erro por campo, no formato de `zod.flatten()`. */
export function parseTemplateFields(template: ImageTemplateId, fields: unknown) {
  return templateSchemas[template].safeParse(fields ?? {}) as z.SafeParseReturnType<unknown, ImageFields>;
}

export function isImageTemplateId(value: unknown): value is ImageTemplateId {
  return typeof value === 'string' && value in IMAGE_TEMPLATES;
}

/** Pedido de renderização (rota, MCP e tela usam o mesmo). Aceita os nomes antigos. */
export const renderImageRequestSchema = z
  .object({
    template: z.enum(TEMPLATE_INPUT_IDS),
    fields: z.record(z.unknown()).default({}),
  })
  .transform((v) => resolveTemplate(v.template, v.fields)!);

export const saveRenderedImageRequestSchema = z
  .object({
    template: z.enum(TEMPLATE_INPUT_IDS),
    fields: z.record(z.unknown()).default({}),
    alt: z.string().trim().min(1, 'Texto alternativo (alt) é obrigatório').max(300, 'Alt: no máximo 300 caracteres'),
  })
  .transform((v) => ({ ...resolveTemplate(v.template, v.fields)!, alt: v.alt }));
export type SaveRenderedImageRequest = z.infer<typeof saveRenderedImageRequestSchema>;

export const importImageRequestSchema = z.object({
  url: z.string().trim().url('URL inválida'),
  alt: z.string().trim().min(1, 'Texto alternativo (alt) é obrigatório').max(300, 'Alt: no máximo 300 caracteres'),
  target: z.enum(['blog', 'social']).default('blog'),
});
export type ImportImageRequest = z.infer<typeof importImageRequestSchema>;

/** Resumo legível dos modelos — descrição da tool MCP e documentação. */
export function describeImageTemplates(): string {
  return IMAGE_TEMPLATE_IDS.map((id) => {
    const t = IMAGE_TEMPLATES[id];
    const fields = t.fields
      .map((f) => {
        const opt = f.optional ? ', opcional' : '';
        if (f.kind === 'int') return `${f.name} (inteiro ${f.min ?? 0}-${f.max}${opt})`;
        if (f.kind === 'choice')
          return `${f.name} (${f.options!.map((o) => o.value).join('|')}, padrão ${f.default})`;
        if (f.kind === 'media') return `${f.name} (mídia${opt})`;
        const lines = MAX_LINES[f.name] ? `, uma linha por item, até ${MAX_LINES[f.name]}` : '';
        const format = f.name === 'questions' ? ', "SIGLA: pergunta"' : f.name === 'cards' ? ', "Rótulo: valor"' : '';
        return `${f.name} (até ${f.max} caracteres${lines}${format}${f.rich ? ', aceita **negrito**, ==marca== e !!carmim!!' : ''}${opt})`;
      })
      .join(', ');
    return `${id} ${t.width}x${t.height}: ${fields}`;
  }).join('; ');
}

/** Catálogo de mídia em uma linha por item — descrição da tool MCP. */
export function describeBrandMedia(): string {
  return BRAND_MEDIA.map((m) => `${m.id} (${m.kind}: ${m.description})`).join('; ');
}
