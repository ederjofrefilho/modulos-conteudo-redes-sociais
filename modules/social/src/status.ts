// Máquina de estados do SocialPost — puro, testado em status.test.ts.
//
// DRAFT ──aprovar (só UI)──▶ APPROVED ──cron/botão (lock)──▶ PUBLISHING ──▶ PUBLISHED
//   ▲                           │                                 └──────▶ FAILED ──tentar de novo──▶ APPROVED
//   └──editar conteúdo──────────┘ (e de FAILED também)
// Qualquer um, menos PUBLISHING ──arquivar──▶ ARCHIVED

export type SocialStatus = 'DRAFT' | 'APPROVED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'ARCHIVED';

export const STATUS_LABEL: Record<SocialStatus, string> = {
  DRAFT: 'Rascunho',
  APPROVED: 'Aprovado',
  PUBLISHING: 'Publicando',
  PUBLISHED: 'Publicado',
  FAILED: 'Com erro',
  ARCHIVED: 'Arquivado',
};

/** Campos cuja mudança muda O QUE vai ao ar — e por isso desfaz a aprovação. */
export const CONTENT_FIELDS = ['text', 'mediaAssetIds', 'linkUrl', 'socialAccountId', 'placement'] as const;
export type ContentField = (typeof CONTENT_FIELDS)[number];

export interface EditablePost {
  status: SocialStatus;
  text: string;
  mediaAssetIds: string[];
  linkUrl: string | null;
  socialAccountId: string;
  /** Feed, reel ou story: mudar o formato é mudar o post. */
  placement?: string;
}

export type EditPatch = Partial<Pick<EditablePost, ContentField>>;

/** Mensagem de por que não dá para editar, ou null se dá. */
export function editBlockedReason(status: SocialStatus): string | null {
  if (status === 'PUBLISHING') return 'Este post está sendo publicado agora — espere terminar.';
  if (status === 'PUBLISHED') return 'Este post já foi publicado — edite direto na rede, ou crie um novo.';
  if (status === 'ARCHIVED') return 'Este post está arquivado.';
  return null;
}

/** Quais campos de conteúdo o patch muda DE VERDADE (igual ao atual não conta). */
export function changedContentFields(current: EditablePost, patch: EditPatch): ContentField[] {
  const changed: ContentField[] = [];
  for (const field of CONTENT_FIELDS) {
    if (!(field in patch) || patch[field] === undefined) continue;
    const next = patch[field];
    const prev = current[field];
    const same = Array.isArray(prev) && Array.isArray(next)
      ? prev.length === next.length && prev.every((v, i) => v === next[i])
      : (prev ?? null) === (next ?? null);
    if (!same) changed.push(field);
  }
  return changed;
}

/**
 * Status depois de uma edição. Mudar conteúdo de um post APPROVED ou FAILED
 * volta para DRAFT (e a aprovação é limpa pelo serviço); um DRAFT continua
 * DRAFT. Edição que não muda conteúdo mantém o status.
 */
export function statusAfterEdit(current: EditablePost, patch: EditPatch): { status: SocialStatus; resetsApproval: boolean } {
  const blocked = editBlockedReason(current.status);
  if (blocked) throw new Error(blocked);
  const changed = changedContentFields(current, patch).length > 0;
  if (!changed) return { status: current.status, resetsApproval: false };
  return { status: 'DRAFT', resetsApproval: current.status !== 'DRAFT' };
}

export function canApprove(status: SocialStatus): string | null {
  return status === 'DRAFT' ? null : `Só rascunho pode ser aprovado (este está "${STATUS_LABEL[status]}").`;
}

export function canArchive(status: SocialStatus): string | null {
  if (status === 'PUBLISHING') return 'Este post está sendo publicado agora — espere terminar.';
  if (status === 'ARCHIVED') return 'Este post já está arquivado.';
  return null;
}

export function canRetry(status: SocialStatus): string | null {
  return status === 'FAILED' ? null : 'Só post com erro pode ser tentado de novo.';
}

/** Agendar/desagendar só muda horário: vale para rascunho e aprovado. */
export function canSchedule(status: SocialStatus): string | null {
  return status === 'DRAFT' || status === 'APPROVED'
    ? null
    : `Não dá para mudar o horário de um post "${STATUS_LABEL[status]}".`;
}

/**
 * Está na hora de publicar? Só APPROVED, sem `externalId` (já foi ao ar =
 * nunca de novo), com `scheduledAt` vencido ou nulo ("assim que aprovado").
 */
export function isDue(
  post: { status: SocialStatus; scheduledAt: Date | null; externalId: string | null },
  now: Date,
): boolean {
  if (post.status !== 'APPROVED' || post.externalId) return false;
  return !post.scheduledAt || post.scheduledAt.getTime() <= now.getTime();
}

/** Lock de PUBLISHING esquecido (processo morreu no meio) depois deste tempo. */
export const PUBLISHING_STALE_MS = 15 * 60_000;

/**
 * Estado que a TELA mostra. "Ideia" e "Agendado" não são status do banco:
 * ideia é um DRAFT marcado `isIdea`; agendado é um APPROVED com horário no
 * futuro (um rascunho com horário é só "horário sugerido" — nada sai sem
 * aprovação). APPROVED sem horário futuro está "Na fila": sai na próxima passada.
 */
export type DisplayState = 'IDEA' | 'DRAFT' | 'SCHEDULED' | 'QUEUED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'ARCHIVED';

export const DISPLAY_LABEL: Record<DisplayState, string> = {
  IDEA: 'Ideia',
  DRAFT: 'Rascunho',
  SCHEDULED: 'Agendado',
  QUEUED: 'Na fila',
  PUBLISHING: 'A publicar',
  PUBLISHED: 'Publicado',
  FAILED: 'Falhou',
  ARCHIVED: 'Arquivado',
};

export function displayState(
  post: { status: SocialStatus; isIdea?: boolean; scheduledAt: Date | string | null },
  now: Date = new Date(),
): DisplayState {
  if (post.status === 'DRAFT') return post.isIdea ? 'IDEA' : 'DRAFT';
  if (post.status === 'APPROVED') {
    const at = post.scheduledAt ? new Date(post.scheduledAt).getTime() : null;
    return at !== null && at > now.getTime() ? 'SCHEDULED' : 'QUEUED';
  }
  return post.status;
}
