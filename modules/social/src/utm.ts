// UTM automático do link de um post — puro, testado em utm.test.ts.
//
// utm_source   = rede (linkedin | instagram)
// utm_medium   = social
// utm_campaign = tema do post (slug) ou a campanha; sem nenhum dos dois, "organico"
// utm_content  = id do post no CRM — é por aqui que a visita ao site
//                (Event site.page_view, payload.utm_content) volta a ligar-se ao post.
//
// Um parâmetro utm_* que já venha no link nunca é sobrescrito.

export interface UtmInput {
  provider: 'LINKEDIN' | 'INSTAGRAM';
  postId: string;
  topic?: string | null;
  campaignKey?: string | null;
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function utmParams(input: UtmInput): Record<string, string> {
  const campaign = slugify(input.topic ?? '') || slugify(input.campaignKey ?? '') || 'organico';
  return {
    utm_source: input.provider.toLowerCase(),
    utm_medium: 'social',
    utm_campaign: campaign,
    utm_content: input.postId,
  };
}

/** Link com os utm_* acrescentados. Link inválido volta como veio. */
export function withUtm(linkUrl: string, input: UtmInput): string {
  let url: URL;
  try {
    url = new URL(linkUrl);
  } catch {
    return linkUrl;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return linkUrl;
  for (const [key, value] of Object.entries(utmParams(input))) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return url.toString();
}
