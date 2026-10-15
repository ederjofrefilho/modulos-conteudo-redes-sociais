'use client';

import { useEffect, useState, useTransition } from 'react';
import { Users } from 'lucide-react';
import { ACCESS_LABEL, type AccessLevel } from '@app/social/access';
import { Avatar, Badge, Checkbox, Drawer, EmptyState, Select, Skeleton, useToast } from '@/components/ui';
import { listSocialAccessAction, setSocialAccessAction } from '@/app/(app)/social/account-actions';
import { AccountAvatar } from '@/components/social/AccountAvatar';
import type { AccountRow } from './SocialAccountRow';

type Row = Awaited<ReturnType<typeof listSocialAccessAction>>[number];

const LEVELS: AccessLevel[] = ['NONE', 'VIEW', 'DRAFT', 'PUBLISH'];
const LEVEL_HINT: Record<AccessLevel, string> = {
  NONE: 'Não vê a conta',
  VIEW: 'Vê as publicações no calendário e na lista',
  DRAFT: 'Também cria rascunhos e envia para aprovação',
  PUBLISH: 'Também aprova, agenda e publica',
};

/**
 * Quem pode usar uma conta da empresa e até onde. Cada alteração grava logo
 * (sem botão de guardar) e vale no servidor — UI, MCP e API passam pela mesma
 * regra. Administradores têm sempre tudo.
 */
export function SocialAccessDrawer({ account, onClose }: { account: AccountRow; onClose: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    listSocialAccessAction(account.id)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [account.id]);

  function save(row: Row, patch: Partial<Pick<Row, 'level' | 'canViewMetrics'>>) {
    const next = { ...row, ...patch };
    setRows((all) => all?.map((r) => (r.user.id === row.user.id ? next : r)) ?? null);
    startTransition(async () => {
      const res = await setSocialAccessAction({
        accountId: account.id,
        userId: row.user.id,
        level: next.level,
        canViewMetrics: next.level === 'NONE' ? false : next.canViewMetrics,
      });
      if (!res.ok) {
        toast(res.error ?? 'Não foi possível guardar.', 'error');
        setRows((all) => all?.map((r) => (r.user.id === row.user.id ? row : r)) ?? null);
      } else toast(`Acesso de ${row.user.name ?? row.user.email}: ${ACCESS_LABEL[next.level]}.`, 'success');
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Permissões"
    >
      <div className="flex flex-col gap-4">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <AccountAvatar name={account.displayName} avatarUrl={account.avatarUrl} provider={account.provider} /> {account.displayName}
        </p>
        <p className="text-sm text-muted">
          Quem pode usar <strong className="font-medium text-foreground">{account.displayName}</strong>. Quem só cria
          rascunhos envia para aprovação; quem publica (ou um administrador) aprova ou devolve com comentário.
        </p>
        {rows === null ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : rows.length === 0 ? (
          <EmptyState size="inline" icon={Users} title="Sem utilizadores ativos" />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((r) => (
              <li key={r.user.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={r.user.name ?? r.user.email} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{r.user.name ?? r.user.email}</p>
                  <p className="truncate text-xs text-muted">{r.admin ? 'Administrador: acesso total' : LEVEL_HINT[r.level]}</p>
                </div>
                {r.admin ? (
                  <Badge tone="info">Tudo</Badge>
                ) : (
                  <div className="flex items-center gap-3">
                    <Select
                      inputSize="sm"
                      aria-label={`Acesso de ${r.user.name ?? r.user.email}`}
                      className="w-44"
                      value={r.level}
                      disabled={pending}
                      onChange={(e) => save(r, { level: e.target.value as AccessLevel })}
                      options={LEVELS.map((l) => ({ value: l, label: ACCESS_LABEL[l] }))}
                    />
                    <label className="flex items-center gap-1.5 text-xs text-foreground">
                      <Checkbox
                        checked={r.level !== 'NONE' && r.canViewMetrics}
                        disabled={pending || r.level === 'NONE'}
                        onChange={(e) => save(r, { canViewMetrics: e.target.checked })}
                      />
                      Ver métricas
                    </label>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
