import { PageHeader, PageShell } from '@/components/ui';
import { requireCtx } from '@/lib/session';
import { ImageGenerator } from './ImageGenerator';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Gerar imagem' };

export default async function GenerateImagePage() {
  await requireCtx();
  return (
    <PageShell width="wide">
      <PageHeader
        title="Gerar imagem"
        description="Capa de blog e peças de rede social a partir dos modelos com a identidade da empresa. A imagem vai para a biblioteca de conteúdo."
      />
      <ImageGenerator />
    </PageShell>
  );
}
