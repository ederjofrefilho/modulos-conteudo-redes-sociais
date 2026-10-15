import Link from 'next/link';
import { Plus } from 'lucide-react';
import { socialPosts, PROVIDER_LABEL, displayState } from '@app/social';
import { StateBadge } from './PostBits';

/**
 * "Divulgação" no artigo (`/conteudo/[id]`): os posts de rede social que
 * nasceram dele (`sourceContentPostId`), em qualquer status, e o atalho para
 * criar mais um já ligado ao artigo.
 */
export async function PostPromotionSection({ contentPostId }: { contentPostId: string }) {
  const { items } = await socialPosts.listSocialPosts({ sourceContentPostId: contentPostId, take: 50 });
  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 ? (
        <p className="text-xs text-muted">Nenhum post de rede social ligado a este artigo.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((p) => (
            <li key={p.id}>
              <Link
                href={`/social?post=${p.id}`}
                className="flex items-center gap-2 rounded-md px-1 py-1 text-xs transition-colors hover:bg-surface-2"
              >
                <StateBadge state={displayState(p)} />
                <span className="shrink-0 text-foreground">{PROVIDER_LABEL[p.socialAccount.provider]}</span>
                <span className="min-w-0 truncate text-muted">{p.text || '(sem texto)'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={`/social?novo=1&artigo=${contentPostId}`}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Novo post de divulgação
      </Link>
    </div>
  );
}
