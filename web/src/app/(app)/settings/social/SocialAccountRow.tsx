'use client';

import { Shield, Unplug } from 'lucide-react';
import { ACCESS_LABEL, type AccessLevel } from '@app/social/access';
import type { SocialProviderName } from '@app/social/rules';
import { Badge, Button, Checkbox } from '@/components/ui';
import { AccountAvatar } from '@/components/social/AccountAvatar';

export interface AccountRow {
  id: string;
  provider: SocialProviderName;
  kind: 'PERSON' | 'ORGANIZATION';
  displayName: string;
  avatarUrl: string | null;
  isActive: boolean;
  lastError: string | null;
  tokenExpiresAt: string | null;
  connectedBy: string | null;
  /** Permissões que faltam para métricas completas (vazio = tem tudo). */
  missingScopes: string[];
  importPosts: boolean;
  importedAt: string | null;
  importError: string | null;
  shared: boolean;
  ownerName: string | null;
  /** O que quem vê pode fazer. */
  access: AccessLevel;
  /** Pode ligar/desligar/reconectar (dono da pessoal ou ADMIN nas da empresa). */
  canManage: boolean;
}

/** Dias até o acesso expirar (negativo = já expirou), ou null quando a rede não informou. */
export function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function metricsNote(a: AccountRow): string {
  if (a.missingScopes.length === 0) return 'Métricas e publicações: completas.';
  if (a.provider === 'LINKEDIN' && a.kind === 'PERSON')
    return 'Perfil pessoal: o LinkedIn não deixa ler as publicações nem as métricas de perfis com este app (permissões r_member_social e r_member_postAnalytics). Publicar funciona.';
  if (a.provider === 'INSTAGRAM') return `Métricas: só gostos, comentários e seguidores — reconecte aceitando a permissão de insights (falta ${a.missingScopes.join(', ')}).`;
  return `Métricas e publicações indisponíveis: falta ${a.missingScopes.join(', ')}.`;
}

export function SocialAccountRow({
  account: a,
  pending,
  onDisconnect,
  onToggleImport,
  onPermissions,
}: {
  account: AccountRow;
  pending: boolean;
  onDisconnect: () => void;
  onToggleImport: (enabled: boolean) => void;
  /** Só nas contas da empresa, para ADMIN. */
  onPermissions?: () => void;
}) {
  const days = daysLeft(a.tokenExpiresAt);
  const canSync = a.isActive && !(a.provider === 'LINKEDIN' && a.kind === 'PERSON');
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <AccountAvatar name={a.displayName} avatarUrl={a.avatarUrl} provider={a.provider} size="md" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          {a.displayName}
          <Badge>{a.provider === 'LINKEDIN' ? (a.kind === 'ORGANIZATION' ? 'Página' : 'Perfil') : a.kind === 'ORGANIZATION' ? 'Empresa' : 'Criador'}</Badge>
          {!a.isActive ? (
            <Badge tone="danger">Desconectada</Badge>
          ) : days !== null && days <= 7 ? (
            <Badge tone={days <= 0 ? 'danger' : 'warning'}>{days <= 0 ? 'Acesso expirado' : `Expira em ${days} dia(s)`}</Badge>
          ) : (
            <Badge tone="success">Ativa</Badge>
          )}
          {a.shared && !a.canManage && <Badge tone="info">O seu acesso: {ACCESS_LABEL[a.access]}</Badge>}
        </p>
        <p className="text-xs text-muted">
          {a.tokenExpiresAt ? `Acesso válido até ${new Date(a.tokenExpiresAt).toLocaleDateString('pt-BR')}` : 'Validade do acesso não informada'}
          {a.ownerName && !a.shared && ` · de ${a.ownerName}`}
          {a.connectedBy && ` · ligada por ${a.connectedBy}`}
        </p>
        {a.lastError && <p className="mt-1 text-xs text-danger">Último erro: {a.lastError}</p>}
        {a.isActive && <p className="mt-1 text-xs text-muted">{metricsNote(a)}</p>}
        {canSync && a.canManage && (
          <label className="mt-1 flex items-center gap-2 text-xs text-foreground">
            <Checkbox checked={a.importPosts} disabled={pending} onChange={(e) => onToggleImport(e.target.checked)} />
            Sincronizar as publicações da rede, incluindo as feitas fora do CRM (últimos 180 dias)
            {a.importPosts && a.importedAt && <span className="text-muted">· última: {new Date(a.importedAt).toLocaleString('pt-BR')}</span>}
          </label>
        )}
        {a.importPosts && a.importError && <p className="mt-1 text-xs text-danger">Sincronização: {a.importError}</p>}
      </div>
      {onPermissions && (
        <Button size="sm" variant="secondary" onClick={onPermissions} disabled={pending}>
          <Shield className="h-3.5 w-3.5" /> Permissões
        </Button>
      )}
      {a.isActive && a.canManage && (
        <Button size="sm" variant="ghost" onClick={onDisconnect} disabled={pending}>
          <Unplug className="h-3.5 w-3.5" /> Desligar
        </Button>
      )}
    </li>
  );
}
