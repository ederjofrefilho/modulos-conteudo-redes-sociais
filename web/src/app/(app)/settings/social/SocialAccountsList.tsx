'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Plug } from 'lucide-react';
import { PROVIDER_LABEL, type SocialProviderName } from '@app/social/rules';
import { Button, ConfirmDialog, EmptyState, LinkButton, useToast } from '@/components/ui';
import { disconnectSocialAccountAction } from '@/app/(app)/social/actions';
import { setSocialImportAction } from '@/app/(app)/social/account-actions';
import { SocialAccountRow, type AccountRow } from './SocialAccountRow';
import { SocialAccessDrawer } from './SocialAccessDrawer';

export type { AccountRow } from './SocialAccountRow';

const CONNECT_PATH: Record<SocialProviderName, string> = {
  LINKEDIN: '/api/social/linkedin/connect',
  INSTAGRAM: '/api/social/instagram/connect',
};

/**
 * Uma secção de contas: "As minhas contas" (cada pessoa liga as suas) ou
 * "Contas da empresa" (um ADMIN liga e dá acesso). "Ligar" leva ao OAuth da rede
 * quando o app dela está configurado (envs); senão fica desativado, com o
 * motivo. Ligar de novo a mesma conta só renova o acesso.
 */
export function SocialAccountsList({
  scope,
  accounts,
  connectable,
  admin,
}: {
  scope: 'mine' | 'shared' | 'team';
  accounts: AccountRow[];
  connectable: Record<SocialProviderName, boolean>;
  admin: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<AccountRow | null>(null);
  const [permissions, setPermissions] = useState<AccountRow | null>(null);

  function disconnect(row: AccountRow) {
    startTransition(async () => {
      const res = await disconnectSocialAccountAction(row.id);
      setConfirm(null);
      toast(res.ok ? 'Conta desligada.' : (res.error ?? 'Não foi possível desligar. Tente de novo.'), res.ok ? 'success' : 'error');
      router.refresh();
    });
  }

  function toggleImport(row: AccountRow, enabled: boolean) {
    startTransition(async () => {
      const res = await setSocialImportAction(row.id, enabled);
      if (!res.ok) toast(res.error ?? 'Não foi possível alterar.', 'error');
      else if (res.data?.error) toast(res.data.error, 'error');
      else toast(enabled ? `Sincronização ligada: ${res.data?.imported ?? 0} publicação(ões) nova(s).` : 'Sincronização desligada.', 'success');
      router.refresh();
    });
  }

  const missingApp = (['LINKEDIN', 'INSTAGRAM'] as const).filter((p) => !connectable[p]);

  return (
    <div className="flex flex-col gap-4">
      {accounts.length === 0 ? (
        <EmptyState
          size="inline"
          icon={scope === 'mine' ? Plug : Building2}
          title={scope === 'mine' ? 'Ainda não ligou nenhuma conta sua' : 'Nenhuma conta da empresa ligada'}
          description={
            scope === 'mine'
              ? 'Ligue o seu LinkedIn (e o seu Instagram profissional) para preparar e publicar a partir daqui.'
              : admin
                ? 'Ligue a Página da empresa no LinkedIn e o Instagram da empresa. Depois dê acesso a quem vai usar.'
                : 'Um administrador ainda não ligou as contas da empresa ou não lhe deu acesso.'
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {accounts.map((a) => (
            <SocialAccountRow
              key={a.id}
              account={a}
              pending={pending}
              onDisconnect={() => setConfirm(a)}
              onToggleImport={(enabled) => toggleImport(a, enabled)}
              onPermissions={scope === 'shared' && admin ? () => setPermissions(a) : undefined}
            />
          ))}
        </ul>
      )}

      {(scope === 'mine' || (scope === 'shared' && admin)) && (
        <div className="flex flex-wrap items-center gap-2">
          {scope === 'mine' ? (
            <>
              <ConnectButton href={CONNECT_PATH.LINKEDIN} enabled={connectable.LINKEDIN} label="Ligar o meu LinkedIn" />
              <ConnectButton href={CONNECT_PATH.INSTAGRAM} enabled={connectable.INSTAGRAM} label="Ligar o meu Instagram" variant="ghost" />
            </>
          ) : (
            <>
              <ConnectButton href={`${CONNECT_PATH.LINKEDIN}?pagina=1`} enabled={connectable.LINKEDIN} label="Ligar a Página da empresa (LinkedIn)" />
              <ConnectButton href={`${CONNECT_PATH.INSTAGRAM}?partilhada=1`} enabled={connectable.INSTAGRAM} label="Ligar o Instagram da empresa" variant="ghost" />
            </>
          )}
          <p className="basis-full text-xs text-muted">
            O acesso vale cerca de 60 dias. O Instagram renova sozinho; o LinkedIn avisa no sino uma semana antes e
            renova ao ligar de novo. O Instagram só aceita contas profissionais (Empresa ou Criador de conteúdo) —
            mude o tipo de conta no app do Instagram antes de ligar. Não precisa de página do Facebook.
          </p>
          {missingApp.length > 0 && (
            <p className="basis-full text-xs text-muted">
              Falta configurar o app {missingApp.map((p) => `do ${PROVIDER_LABEL[p]}`).join(' e ')} neste ambiente — ver docs/redes-sociais-setup.md.
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        title="Desligar conta"
        message={`Desligar "${confirm?.displayName ?? ''}"? O acesso guardado é apagado. As publicações ficam no CRM; as aprovadas para esta conta falham até a ligar de novo.`}
        confirmLabel="Desligar"
        pending={pending}
        onConfirm={() => confirm && disconnect(confirm)}
        onClose={() => setConfirm(null)}
      />
      {permissions && <SocialAccessDrawer account={permissions} onClose={() => setPermissions(null)} />}
    </div>
  );
}

function ConnectButton({
  href,
  enabled,
  label,
  variant = 'secondary',
}: {
  href: string;
  enabled: boolean;
  label: string;
  variant?: 'secondary' | 'ghost';
}) {
  if (!enabled)
    return (
      <Button size="sm" variant={variant} disabled>
        <Plug className="h-3.5 w-3.5" /> {label}
      </Button>
    );
  return (
    <LinkButton href={href} prefetch={false} size="sm" variant={variant}>
      <Plug className="h-3.5 w-3.5" /> {label}
    </LinkButton>
  );
}
