import { cookies } from 'next/headers';
import { isAdmin } from '@app/core';
import { canManageAccount, getMetricsCapabilities, instagramCredentials, linkedinCredentials, socialAccounts, publishMode } from '@app/social';
import { Badge, Card, CardBody, CardHeader, CardTitle, PageHeader } from '@/components/ui';
import { requireCtx } from '@/lib/session';
import { FLASH_COOKIE } from '@/lib/social-oauth';
import { SocialAccountsList, type AccountRow } from './SocialAccountsList';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Contas sociais' };

export default async function SocialSettingsPage() {
  const ctx = await requireCtx();
  const admin = isAdmin(ctx);
  const [accounts, capabilities] = await Promise.all([socialAccounts.listAccountsFor(ctx, { team: admin }), getMetricsCapabilities()]);
  const missing = new Map(capabilities.map((c) => [c.id, c.missingScopes]));
  const actor = { id: ctx.actor.id, role: ctx.actor.role };
  const rows: AccountRow[] = accounts.map((a) => ({
    id: a.id,
    provider: a.provider,
    kind: a.kind,
    displayName: a.displayName,
    avatarUrl: a.avatarUrl,
    isActive: a.isActive,
    lastError: a.lastError,
    missingScopes: missing.get(a.id) ?? [],
    tokenExpiresAt: a.tokenExpiresAt?.toISOString() ?? null,
    connectedBy: a.connectedBy ? (a.connectedBy.name ?? a.connectedBy.email) : null,
    importPosts: a.importPosts,
    importedAt: a.importedAt?.toISOString() ?? null,
    importError: a.importError,
    shared: a.shared,
    ownerName: a.owner ? (a.owner.name ?? a.owner.email) : null,
    access: a.access.level,
    canManage: canManageAccount(a, actor),
  }));
  const ownerOf = new Map(accounts.map((a) => [a.id, a.ownerId]));
  const mine: AccountRow[] = rows.filter((r) => !r.shared && ownerOf.get(r.id) === ctx.actor.id).map((r) => ({ ...r, ownerName: null }));
  const shared = rows.filter((r) => r.shared);
  // ADMIN vê também as contas pessoais da equipa (só para saber quem ligou o quê; desligar é do dono ou dele).
  const team = admin ? rows.filter((r) => !r.shared && !mine.includes(r)) : [];
  const simulating = publishMode() === 'log';
  const connectable = { LINKEDIN: !!linkedinCredentials(), INSTAGRAM: !!instagramCredentials() };
  // Recado do callback OAuth ("ok:..." ou "erro:..."), gravado num cookie de 60 s.
  const flash = (await cookies()).get(FLASH_COOKIE)?.value ?? null;
  const flashOk = flash?.startsWith('ok:') ?? false;
  const flashText = flash ? flash.slice(flash.indexOf(':') + 1) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="-mb-6"
        title="Contas sociais"
        description="Cada pessoa liga as suas contas do LinkedIn e do Instagram. As contas da empresa são ligadas por um administrador, que dá acesso a quem as vai usar. Só posts aprovados em /social vão ao ar."
        badges={simulating ? <Badge tone="warning">Modo simulação</Badge> : undefined}
      />
      {simulating && (
        <p className="text-sm text-muted">
          Publicação em simulação (<code className="font-mono text-xs">SOCIAL_PUBLISH</code> diferente de{' '}
          <code className="font-mono text-xs">live</code>): aprovar marca o post como publicado sem chamar a rede.
        </p>
      )}
      {flashText && (
        <p role={flashOk ? 'status' : 'alert'} className={flashOk ? 'rounded-xl bg-surface-2 p-3 text-sm text-foreground' : 'rounded-xl bg-danger/10 p-3 text-sm text-danger'}>
          {flashText}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>As minhas contas</CardTitle>
        </CardHeader>
        <CardBody>
          <SocialAccountsList scope="mine" accounts={mine} connectable={connectable} admin={admin} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Contas da empresa</CardTitle>
        </CardHeader>
        <CardBody>
          <SocialAccountsList scope="shared" accounts={shared} connectable={connectable} admin={admin} />
        </CardBody>
      </Card>
      {team.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Contas pessoais da equipa</CardTitle>
          </CardHeader>
          <CardBody>
            <SocialAccountsList scope="team" accounts={team} connectable={connectable} admin={admin} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
