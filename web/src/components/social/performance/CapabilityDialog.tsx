'use client';

import { PROVIDER_LABEL, type SocialProviderName } from '@app/social/rules';
import { Dialog, LinkButton } from '@/components/ui';
import { dateTimeLabel } from '../PostBits';

export interface Capability {
  id: string;
  provider: SocialProviderName;
  kind: 'PERSON' | 'ORGANIZATION';
  displayName: string;
  isActive: boolean;
  missingScopes: string[];
  metricsAt: string | null;
  metricsError: string | null;
}

/** O que cada conta consegue medir hoje, em palavras, e o que lhe falta. */
function summary(c: Capability): string {
  if (c.provider === 'INSTAGRAM') {
    return c.missingScopes.length
      ? 'Hoje: gostos, comentários e seguidores. Falta permissão para alcance, visualizações, partilhas e guardados.'
      : 'Completo: visualizações, alcance, gostos, comentários, partilhas, guardados e seguidores.';
  }
  if (c.missingScopes.length === 0) return 'Completo para o que o LinkedIn dá por API.';
  return c.kind === 'PERSON'
    ? 'Hoje: nada. A permissão de publicar do LinkedIn não deixa ler métricas de um perfil pessoal.'
    : 'Hoje: nada. Faltam as permissões de leitura da página.';
}

export function CapabilityDialog({ open, onClose, capabilities }: { open: boolean; onClose: () => void; capabilities: Capability[] }) {
  return (
    <Dialog open={open} title="O que cada conta consegue medir" onClose={onClose} size="lg">
      <div className="flex flex-col gap-4">
        {capabilities.length === 0 && <p className="text-sm text-muted">Nenhuma conta conectada.</p>}
        {capabilities.map((c) => (
          <section key={c.id} className="flex flex-col gap-1 rounded-lg bg-surface-2 p-3">
            <h3 className="text-sm font-semibold text-foreground">
              {PROVIDER_LABEL[c.provider]} · {c.displayName}
              {!c.isActive && <span className="font-normal text-muted"> (desconectada)</span>}
            </h3>
            <p className="text-sm text-foreground">{summary(c)}</p>
            {c.missingScopes.length > 0 && (
              <p className="text-xs text-muted">
                Permissões em falta: <code className="font-mono">{c.missingScopes.join(', ')}</code>
              </p>
            )}
            <p className="text-xs text-muted">
              {c.metricsAt ? `Última recolha da conta: ${dateTimeLabel(c.metricsAt)}.` : 'Ainda sem recolha.'}
              {c.metricsError ? ` ${c.metricsError}` : ''}
            </p>
          </section>
        ))}
        <p className="text-sm text-muted">
          As permissões são pedidas no app de cada rede (LinkedIn Developers e Meta for Developers) e só depois a conta é
          reconectada com elas. Os passos estão em Configurações → Redes sociais.
        </p>
        <div className="flex justify-end">
          <LinkButton href="/settings/social" size="sm" variant="secondary">
            Abrir Configurações → Redes sociais
          </LinkButton>
        </div>
      </div>
    </Dialog>
  );
}
