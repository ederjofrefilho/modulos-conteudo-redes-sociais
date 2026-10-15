import type { socialPosts } from '@app/social';
import { displayState, type DisplayState, type SocialStatus } from '@app/social/status';
import { postFormat, readMetrics, type PostFormat, type PostMetrics } from '@app/social/metrics';
import { isPlacement, type SocialPlacement, type SocialProviderName } from '@app/social/rules';
import type { AccessLevel } from '@app/social/access';
import { readRemote, remoteFormat, remoteThumb, type RemoteContent } from '@app/social/remote';

type Dto = Awaited<ReturnType<typeof socialPosts.getSocialPost>>;

export interface WorkspaceMedia {
  id: string;
  url: string;
  width: number;
  height: number;
  alt: string;
  bytes: number;
  mimeType: string;
  durationMs?: number | null;
}

export interface WorkspaceAccount {
  id: string;
  provider: SocialProviderName;
  displayName: string;
  avatarUrl: string | null;
  isActive: boolean;
  /** Conta da empresa (partilhada) ou pessoal. */
  shared: boolean;
  /** Dono da conta pessoal (nome), para o ADMIN a ver a equipa. */
  ownerName: string | null;
  /** O que quem vê pode fazer nesta conta. */
  access: AccessLevel;
  metrics: boolean;
}

/** Um post como a tela /social o usa: serializável (datas em ISO) e já com o estado de tela. */
export interface WorkspacePost {
  id: string;
  status: SocialStatus;
  state: DisplayState;
  isIdea: boolean;
  text: string;
  linkUrl: string | null;
  utmAuto: boolean;
  topic: string | null;
  campaignKey: string | null;
  format: PostFormat;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  externalUrl: string | null;
  lastError: string | null;
  account: WorkspaceAccount;
  author: { id: string; name: string };
  approvedByName: string | null;
  media: WorkspaceMedia[];
  issues: { errors: Record<string, string>; warnings: Record<string, string> };
  source: { id: string; title: string } | null;
  simulated: boolean;
  metrics: PostMetrics | null;
  /** crm = criado aqui; imported = publicado direto na rede (sincronizado). */
  origin: string;
  /** Instagram: feed, reel ou story (LinkedIn é sempre feed). */
  placement: SocialPlacement;
  /** Miniatura: 1ª imagem da biblioteca ou a cópia da media sincronizada. */
  thumbUrl: string | null;
  remote: RemoteContent | null;
  review: {
    state: 'pending' | 'returned' | null;
    comment: string | null;
    submittedBy: string | null;
    reviewedBy: string | null;
  };
  scheduledByName: string | null;
  publishedByName: string | null;
}

/** Conta do post com o acesso de quem vê (`known`, vindo de `listAccountsFor`). Fora do mapa = só ver. */
function accountOf(a: Dto['socialAccount'], known: Map<string, WorkspaceAccount>): WorkspaceAccount {
  return (
    known.get(a.id) ?? {
      id: a.id,
      provider: a.provider,
      displayName: a.displayName,
      avatarUrl: a.avatarUrl,
      isActive: a.isActive,
      shared: a.shared,
      ownerName: null,
      access: 'VIEW',
      metrics: false,
    }
  );
}

/** DTO do serviço → forma serializável (Server → Client Component). `accounts` = as contas de quem vê. */
export function toWorkspacePosts(rows: Dto[], accounts: WorkspaceAccount[], now = new Date()): WorkspacePost[] {
  const known = new Map(accounts.map((a) => [a.id, a]));
  return rows.map((p) => toWorkspacePost(p, known, now));
}

/** Contas do serviço (`listAccountsFor`) → forma da tela. */
export function toWorkspaceAccount(a: {
  id: string;
  provider: SocialProviderName;
  displayName: string;
  avatarUrl: string | null;
  isActive: boolean;
  shared: boolean;
  owner: { name: string | null; email: string } | null;
  access: { level: AccessLevel; metrics: boolean };
}): WorkspaceAccount {
  return {
    id: a.id,
    provider: a.provider,
    displayName: a.displayName,
    avatarUrl: a.avatarUrl,
    isActive: a.isActive,
    shared: a.shared,
    ownerName: a.owner ? (a.owner.name ?? a.owner.email) : null,
    access: a.access.level,
    metrics: a.access.metrics,
  };
}

function toWorkspacePost(p: Dto, known: Map<string, WorkspaceAccount>, now: Date): WorkspacePost {
  const provider = p.providerState && typeof p.providerState === 'object' ? (p.providerState as Record<string, unknown>) : {};
  const remote = readRemote(p.remote);
  const name = (u: { name: string | null; email: string } | null) => (u ? (u.name ?? u.email) : null);
  const firstImage = p.media.find((m) => !m.mimeType.startsWith('video/'));
  return {
    id: p.id,
    status: p.status,
    state: displayState(p, now),
    isIdea: p.isIdea,
    text: p.text,
    linkUrl: p.linkUrl,
    utmAuto: p.utmAuto,
    topic: p.topic,
    campaignKey: p.campaignKey,
    format: remote && !p.media.length ? remoteFormat(remote.type) : postFormat(p, p.media.length === 1 && p.media[0]!.mimeType.startsWith('video/')),
    scheduledAt: p.scheduledAt?.toISOString() ?? null,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    externalUrl: p.externalUrl,
    lastError: p.lastError,
    account: accountOf(p.socialAccount, known),
    author: { id: p.createdBy.id, name: p.createdBy.name ?? p.createdBy.email },
    approvedByName: p.approvedBy ? (p.approvedBy.name ?? p.approvedBy.email) : null,
    media: p.media.map(({ id, url, width, height, alt, bytes, mimeType, durationMs }) => ({ id, url, width, height, alt, bytes, mimeType, durationMs })),
    issues: p.issues,
    source: p.sourceContentPost ? { id: p.sourceContentPost.id, title: p.sourceContentPost.title } : null,
    simulated: provider.simulated === true,
    metrics: readMetrics(p.metrics),
    origin: p.origin,
    placement: isPlacement(p.placement) ? p.placement : 'feed',
    thumbUrl: firstImage?.url ?? remoteThumb(remote),
    remote,
    review: {
      state: p.reviewState === 'pending' || p.reviewState === 'returned' ? p.reviewState : null,
      comment: p.reviewComment,
      submittedBy: name(p.submittedBy),
      reviewedBy: name(p.reviewedBy),
    },
    scheduledByName: name(p.scheduledBy),
    publishedByName: name(p.publishedBy),
  };
}

/** Data que posiciona o post no calendário: quando saiu, ou quando está marcado. */
export function postDate(p: Pick<WorkspacePost, 'publishedAt' | 'scheduledAt'>): string | null {
  return p.publishedAt ?? p.scheduledAt;
}

/** Arrastar só muda o horário de rascunho/ideia e de aprovado (mesma regra do serviço). */
export function canReschedule(p: Pick<WorkspacePost, 'status' | 'account'>): boolean {
  if (p.status === 'DRAFT') return p.account.access === 'DRAFT' || p.account.access === 'PUBLISH';
  return p.status === 'APPROVED' && p.account.access === 'PUBLISH';
}

/** Editar no composer: estado editável e acesso para criar (aprovado/falhado só quem publica). */
export function canEditPost(p: Pick<WorkspacePost, 'status' | 'account'>): boolean {
  if (!isEditable(p)) return false;
  return p.status === 'DRAFT' ? p.account.access === 'DRAFT' || p.account.access === 'PUBLISH' : p.account.access === 'PUBLISH';
}

export function isEditable(p: Pick<WorkspacePost, 'status'>): boolean {
  return p.status === 'DRAFT' || p.status === 'APPROVED' || p.status === 'FAILED';
}

export interface BestSlot {
  weekday: number;
  hour: number;
  posts: number;
  rate: number | null;
}

/**
 * Item do calendário/lista. Cada post é independente (decisão de produto, * 14/10/2026: nada de agrupar LinkedIn e Instagram numa publicação só, mesmo
 * com a mesma campanha) — `variants` é sempre só o próprio post; o formato
 * fica para as peças que tratam um item com várias versões.
 */
export type WorkspaceGroup = WorkspacePost & { variants: WorkspacePost[] };

export function asItems(posts: WorkspacePost[]): WorkspaceGroup[] {
  return posts.map((p) => ({ ...p, variants: [p] }));
}
