// Regras de acesso às contas sociais — puras, também importadas pelo navegador
// (`@app/social/access`) para esconder o que a pessoa não pode fazer. Quem
// decide de verdade é o servidor (`access.ts`), com estas mesmas funções.
//
// - ADMIN: tudo, em todas as contas (inclusive ver o calendário da equipa).
// - Conta pessoal (`shared = false`): só o dono, com tudo.
// - Conta partilhada da empresa: o nível que um ADMIN deu (sem linha = sem acesso).

export type AccessLevel = 'NONE' | 'VIEW' | 'DRAFT' | 'PUBLISH';

export const ACCESS_ORDER: Record<AccessLevel, number> = { NONE: 0, VIEW: 1, DRAFT: 2, PUBLISH: 3 };

export const ACCESS_LABEL: Record<AccessLevel, string> = {
  NONE: 'Sem acesso',
  VIEW: 'Ver',
  DRAFT: 'Criar rascunhos',
  PUBLISH: 'Publicar e agendar',
};

export interface AccountAccess {
  level: AccessLevel;
  metrics: boolean;
  /** Dono da conta pessoal (pode desligar e reconectar). */
  owner: boolean;
}

export interface AccessAccount {
  shared: boolean;
  ownerId: string | null;
}

export interface AccessUser {
  id: string;
  role: 'ADMIN' | 'MEMBER' | string;
}

export interface AccessGrant {
  level: 'VIEW' | 'DRAFT' | 'PUBLISH';
  canViewMetrics: boolean;
}

export function resolveAccess(account: AccessAccount, user: AccessUser, grant?: AccessGrant | null): AccountAccess {
  const owner = !account.shared && account.ownerId === user.id;
  if (user.role === 'ADMIN' || owner) return { level: 'PUBLISH', metrics: true, owner };
  if (account.shared && grant) return { level: grant.level, metrics: grant.canViewMetrics, owner: false };
  return { level: 'NONE', metrics: false, owner: false };
}

export function atLeast(level: AccessLevel, min: AccessLevel): boolean {
  return ACCESS_ORDER[level] >= ACCESS_ORDER[min];
}

/** Gerir a conta (ligar, reconectar, desligar, importar): ADMIN nas partilhadas, o dono nas pessoais. */
export function canManageAccount(account: AccessAccount, user: AccessUser): boolean {
  if (user.role === 'ADMIN') return true;
  return !account.shared && account.ownerId === user.id;
}
