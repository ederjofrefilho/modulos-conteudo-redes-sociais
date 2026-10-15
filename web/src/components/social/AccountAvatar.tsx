import { Avatar } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PROVIDER_LABEL, type SocialProviderName } from '@app/social/rules';
import type { SelectOption } from '@/components/ui';
import type { WorkspaceAccount } from './types';
import { NetworkIcon } from './PostBits';

const SIZE = { xs: 'h-4 w-4', sm: 'h-6 w-6', md: 'h-8 w-8' } as const;

/**
 * Foto da conta (quando a rede deu uma) com o ícone da rede no canto: é o
 * que distingue "LinkedIn da Ana" de "Página da empresa" no calendário, na lista
 * e no "Publicar como". Sem foto (ou se a URL da rede expirou), as iniciais.
 */
export function AccountAvatar({
  name,
  avatarUrl,
  provider,
  size = 'sm',
  className,
}: {
  name: string;
  avatarUrl: string | null;
  provider: SocialProviderName;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', SIZE[size], className)} title={name}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL externa da rede, sem otimização do Next
        <img
          src={avatarUrl}
          alt=""
          className={cn('rounded-full bg-surface-2 object-cover', SIZE[size])}
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
        />
      ) : (
        <Avatar name={name} size={size} />
      )}
      {size !== 'xs' && (
        <span className="absolute -bottom-0.5 -right-0.5 flex rounded-full bg-surface p-px text-muted">
          <NetworkIcon provider={provider} className="h-2.5 w-2.5" />
        </span>
      )}
    </span>
  );
}

/** Opção de "Publicar como"/"Publicar em": avatar, nome, rede, se é da empresa e se precisa de aprovação. */
export function accountOption(a: WorkspaceAccount): SelectOption {
  return {
    value: a.id,
    label: a.displayName,
    icon: <AccountAvatar name={a.displayName} avatarUrl={a.avatarUrl} provider={a.provider} />,
    disabled: !a.isActive,
    hint: !a.isActive
      ? 'Desconectada'
      : `${PROVIDER_LABEL[a.provider]} · ${a.shared ? 'Conta da empresa' : 'Pessoal'}${a.access === 'DRAFT' ? ' · precisa de aprovação' : ''}`,
  };
}
