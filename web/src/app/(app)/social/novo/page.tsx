import { redirect } from 'next/navigation';

/** O composer passou a ser um painel da própria tela /social; este endereço antigo continua a funcionar. */
export default async function NewSocialPostPage({ searchParams }: { searchParams: Promise<{ artigo?: string }> }) {
  const { artigo } = await searchParams;
  redirect(artigo ? `/social?novo=1&artigo=${encodeURIComponent(artigo)}` : '/social?novo=1');
}
