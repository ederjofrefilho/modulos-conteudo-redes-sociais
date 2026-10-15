import type { SocialProviderName } from '../rules.js';

// Fronteira com cada rede. A regra de negócio (status, aprovação, lock,
// eventos) mora em posts.ts/publish.ts e nunca conhece o fornecedor; trocar
// de API é trocar o adaptador. LinkedIn (Etapa 3) e Instagram (Etapa 4)
// implementam esta interface em providers/<rede>.ts.

export interface PublishMedia {
  id: string;
  url: string; // pública (Blob) — o Instagram baixa daqui
  width: number;
  height: number;
  mimeType: string;
  alt: string;
  /** Tamanho do arquivo; o LinkedIn pede antes do envio de vídeo. */
  bytes?: number;
  durationMs?: number | null;
}

export interface PublishInput {
  postId: string;
  account: {
    id: string;
    provider: SocialProviderName;
    kind: 'PERSON' | 'ORGANIZATION';
    externalId: string;
    /** Token já decifrado. Só existe em memória, durante a chamada. */
    accessToken: string | null;
  };
  text: string;
  /** Instagram: feed, reel ou story (ausente = feed). */
  placement?: 'feed' | 'reel' | 'story';
  media: PublishMedia[];
  linkUrl: string | null;
  /**
   * Prévia do link, para redes que não raspam a página (LinkedIn). Vem do
   * artigo de origem quando o post tem um; senão é null e o adaptador usa o
   * domínio como título.
   */
  linkPreview?: { title: string; description: string | null; thumbnail: PublishMedia | null } | null;
  /**
   * Título do documento quando o LinkedIn publica o carrossel em PDF: o
   * título do artigo de origem, se houver (senão o adaptador usa a primeira
   * linha do texto).
   */
  documentTitle?: string | null;
  /** O que uma tentativa anterior deixou (ex.: containers do Instagram). */
  providerState: Record<string, unknown> | null;
}

export interface PublishResult {
  externalId: string;
  externalUrl: string | null;
  providerState?: Record<string, unknown>;
  simulated?: boolean;
}

/**
 * Erro de publicação com mensagem já pronta para a tela. `providerState`
 * guarda o progresso parcial para a próxima tentativa não duplicar;
 * `deactivateAccount` marca a conta inativa (token expirado/revogado);
 * `retryLater` diz que nada deu errado, a rede só ainda está processando
 * (vídeo leva minutos): o post volta à fila e o cron continua de onde parou.
 */
export class SocialPublishError extends Error {
  constructor(
    message: string,
    readonly opts: { providerState?: Record<string, unknown>; deactivateAccount?: boolean; retryLater?: boolean } = {},
  ) {
    super(message);
    this.name = 'SocialPublishError';
  }
}

export interface SocialProviderAdapter {
  provider: SocialProviderName;
  /** URL de autorização OAuth (Etapas 3 e 4). */
  authorizeUrl?(state: string, redirectUri: string): string;
  /** Publica e devolve o id/url do post na rede. Lança SocialPublishError. */
  publish(input: PublishInput): Promise<PublishResult>;
}
