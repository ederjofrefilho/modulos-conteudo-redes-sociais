import { redirect } from 'next/navigation';

/** O post abre num painel da tela /social; os links antigos (/social/<id>) continuam a funcionar. */
export default async function SocialPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/social?post=${encodeURIComponent(id)}`);
}
