import type { BadgeTone } from '@/components/ui';

/**
 * Rótulos/badges de `ContentKind`/`ContentStatus` — única fonte, reusada por
 * `/conteudo` (listagem), `PostEditor` (barra superior) e
 * `ContentRowActionsMenu` (decide quais ações mostrar). Antes duplicado em 3
 * lugares que podiam divergir silenciosamente.
 */
export type ContentKindLike = 'ARTICLE' | 'CASE';
export type ContentStatusLike = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';

export const STATUS_META: Record<ContentStatusLike, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  SCHEDULED: { label: 'Agendado', tone: 'warning' },
  PUBLISHED: { label: 'Publicado', tone: 'success' },
  ARCHIVED: { label: 'Despublicado', tone: 'neutral' },
};

export const KIND_LABEL: Record<ContentKindLike, string> = { ARTICLE: 'Artigo', CASE: 'Caso de sucesso' };
