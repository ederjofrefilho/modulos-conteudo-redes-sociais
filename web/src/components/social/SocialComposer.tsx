'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Copy, Lightbulb } from 'lucide-react';
import { PROVIDER_LABEL, validateSocialDraft, type SocialPlacement } from '@app/social/rules';
import { withUtm } from '@app/social/utm';
import {
  Button, Drawer, Field, Menu, MenuItem, MultiSelect, Select, useToast,
} from '@/components/ui';
import { duplicateSocialPostAction, saveSocialPostGroupAction } from '@/app/(app)/social/actions';
import { ComposerPreviews, VariantTabs } from './ComposerParts';
import { ReadOnlyVariant, SharedFields, VariantFields, VariantNotices } from './ComposerVariantFields';
import { SocialPostActions } from './SocialPostActions';
import { accountOption } from './AccountAvatar';
import { toLocalInput } from './format';
import { canEditPost, type BestSlot, type WorkspaceAccount, type WorkspaceMedia, type WorkspacePost } from './types';

export type ComposerTarget = { mode: 'new'; date?: string | null; articleId?: string | null } | { mode: 'edit'; id: string };

interface Props {
  target: ComposerTarget | null;
  /** Versões da publicação aberta (uma por rede); vazio num post novo. */
  group: WorkspacePost[];
  accounts: WorkspaceAccount[];
  articles: { id: string; title: string }[];
  topics: string[];
  bestSlots: BestSlot[];
  onClose: () => void;
  onOpen: (id: string) => void;
}

/** Uma versão no formulário: a de uma rede, guardada (`post`) ou nova. */
interface Variant {
  key: string;
  post: WorkspacePost | null;
  accountId: string;
  text: string;
  media: WorkspaceMedia[];
  linkUrl: string;
  when: string;
  placement: SocialPlacement;
}

const snap = (v: Variant) => JSON.stringify([v.accountId, v.text, v.media.map((m) => m.id), v.linkUrl.trim(), v.when, v.placement]);
const singleVideo = (media: WorkspaceMedia[]) => media.length === 1 && media[0]!.mimeType.startsWith('video/');

/**
 * Composer num painel lateral. Editar abre UM post (uma rede). Criar pode ir
 * para várias redes de uma vez: cada rede tem o seu separador com texto,
 * imagens, link e horário (a linguagem do LinkedIn não é a do Instagram), e
 * ao guardar nasce um post independente por rede — sem ligação entre eles.
 * Nada sai daqui sem "Aprovar" — e só se aprova o que está guardado.
 */
export function SocialComposer(props: Props) {
  const { target, group } = props;
  const open = target !== null && (target.mode === 'new' || group.length > 0);
  const key =
    target?.mode === 'edit'
      ? `${group.map((p) => `${p.id}:${p.status}:${p.isIdea}`).join('|')}`
      : `new:${target?.mode === 'new' ? (target.date ?? '') : ''}`;
  return open ? <ComposerBody key={key} {...props} /> : <Drawer open={false} title="Post" onClose={props.onClose}>{null}</Drawer>;
}

function ComposerBody({ target, group, accounts, articles, topics, bestSlots, onClose, onOpen }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const isNew = target?.mode === 'new';
  const first = group[0] ?? null;
  // "Publicar em": só as contas em que a pessoa pode criar (as dela e as da empresa com acesso de rascunho ou mais).
  const usable = accounts.filter((a) => a.access === 'DRAFT' || a.access === 'PUBLISH');
  const active = usable.filter((a) => a.isActive);
  const newDate = target?.mode === 'new' && target.date ? target.date : '';

  const initial: Variant[] = group.length
    ? group.map((p) => ({
        key: p.id,
        post: p,
        accountId: p.account.id,
        text: p.text,
        media: p.media,
        linkUrl: p.linkUrl ?? '',
        when: toLocalInput(p.scheduledAt) ?? '',
        placement: p.placement,
      }))
    : active[0]
      ? [{ key: `new:${active[0].id}`, post: null, accountId: active[0].id, text: '', media: [], linkUrl: '', when: newDate, placement: 'feed' as const }]
      : [];
  const [variants, setVariants] = useState<Variant[]>(initial);
  const [activeKey, setActiveKey] = useState<string | null>(
    target?.mode === 'edit' && initial.some((v) => v.key === target.id) ? target.id : (initial[0]?.key ?? null),
  );
  const [topic, setTopic] = useState(first?.topic ?? '');
  const [utmAuto, setUtmAuto] = useState(first ? first.utmAuto : true);
  const [sourceId, setSourceId] = useState(
    first?.source?.id ?? (target?.mode === 'new' && articles.some((a) => a.id === target.articleId) ? target.articleId! : ''),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const sharedSnap = JSON.stringify([topic.trim(), utmAuto, sourceId]);
  const [saved, setSaved] = useState(() => ({ shared: sharedSnap, variants: Object.fromEntries(initial.filter((v) => v.post).map((v) => [v.key, snap(v)])) }));
  const sharedDirty = sharedSnap !== saved.shared;
  const isDirty = (v: Variant) => !v.post || sharedDirty || saved.variants[v.key] !== snap(v);
  const dirty = variants.some(isDirty);

  const accountOf = (v: Variant) => accounts.find((a) => a.id === v.accountId);
  const editable = (v: Variant) => !v.post || canEditPost(v.post);
  const current = variants.find((v) => v.key === activeKey) ?? variants[0] ?? null;
  const currentAccount = current ? accountOf(current) : undefined;
  const provider = currentAccount?.provider ?? 'LINKEDIN';
  const issuesOf = (v: Variant) => {
    const a = accountOf(v);
    return a
      ? validateSocialDraft({ provider: a.provider, text: v.text, media: v.media, linkUrl: v.linkUrl.trim() || null, placement: v.placement })
      : null;
  };
  const errorCount = useMemo(
    () => variants.filter(editable).reduce((n, v) => n + Object.keys(issuesOf(v)?.errors ?? {}).length, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [variants],
  );

  // Um vídeo sozinho no Instagram sai como Reel: o formato acompanha (Story fica como está).
  const patch = (key: string, change: Partial<Variant>) =>
    setVariants((all) =>
      all.map((v) => {
        if (v.key !== key) return v;
        const next = { ...v, ...change };
        const ig = accounts.find((a) => a.id === next.accountId)?.provider === 'INSTAGRAM';
        if (!ig) next.placement = 'feed';
        else if (change.media && next.placement === 'feed' && singleVideo(next.media)) next.placement = 'reel';
        return next;
      }),
    );

  const accountOptions = usable.map(accountOption);

  // Escolher redes: cada rede nova nasce com o texto e as imagens da versão aberta, para depois adaptar.
  function setNetworks(ids: string[]) {
    const removedSaved = variants.filter((v) => v.post && !ids.includes(v.accountId));
    if (removedSaved.length) {
      toast('Uma rede já guardada não sai daqui: abra o separador dela e use "Arquivar".', 'info');
    }
    const keep = variants.filter((v) => v.post || ids.includes(v.accountId));
    const base = current ?? keep[0];
    const added = ids
      .filter((id) => !keep.some((v) => v.accountId === id))
      .map((id) => ({
        key: `new:${id}`,
        post: null,
        accountId: id,
        text: base?.text ?? '',
        media: base?.media ?? [],
        linkUrl: base?.linkUrl ?? '',
        when: base?.when ?? newDate,
        // Formato do Instagram não existe no LinkedIn: cada rede começa no seu.
        placement: (accounts.find((a) => a.id === id)?.provider === 'INSTAGRAM'
          ? base?.placement ?? (singleVideo(base?.media ?? []) ? 'reel' : 'feed')
          : 'feed') as SocialPlacement,
      }));
    const next = [...keep, ...added];
    setVariants(next);
    if (added[0]) setActiveKey(added[0].key);
    else if (!next.some((v) => v.key === activeKey)) setActiveKey(next[0]?.key ?? null);
  }

  function save(asIdea: boolean) {
    setFieldErrors({});
    const toSave = variants.filter(editable);
    const changed = toSave.filter((v) => v.post && (isDirty(v) || asIdea !== v.post.isIdea)).map((v) => v.key);
    startTransition(async () => {
      const res = await saveSocialPostGroupAction(
        toSave.map((v) => ({
          id: v.post?.id ?? null,
          socialAccountId: v.accountId,
          text: v.text,
          mediaAssetIds: v.media.map((m) => m.id),
          linkUrl: v.linkUrl.trim() || null,
          scheduledAt: v.when ? new Date(v.when).toISOString() : null,
          placement: v.placement,
        })),
        { topic: topic.trim() || null, sourceContentPostId: sourceId || null, utmAuto, isIdea: asIdea, campaignKey: first?.campaignKey ?? null },
        changed,
      );
      if (!res.ok || !res.data) {
        setFieldErrors(Object.fromEntries(Object.entries(res.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0] ?? ''])));
        toast(res.error ?? 'Não foi possível guardar.', 'error');
        return;
      }
      setSaved({ shared: sharedSnap, variants: Object.fromEntries(variants.map((v) => [v.key, snap(v)])) });
      router.refresh();
      const back = Object.entries(res.data.statuses).some(([id, st]) => st === 'DRAFT' && group.find((p) => p.id === id)?.status !== 'DRAFT');
      toast(
        back
          ? 'Guardado. Uma versão aprovada voltou a rascunho: precisa de nova aprovação.'
          : isNew
            ? asIdea
              ? 'Ideia guardada.'
              : toSave.length > 1
                ? `${toSave.length} posts criados como rascunho, um por rede.`
                : 'Rascunho criado.'
            : 'Guardado.',
        'success',
      );
      // Um post novo reabre já guardado; vários (um por rede) ficam no calendário, cada um por si.
      if (isNew && res.data.ids.length === 1) onOpen(res.data.ids[0]!);
      else if (isNew) onClose();
    });
  }

  function duplicateAll() {
    startTransition(async () => {
      let firstId: string | null = null;
      for (const p of group) {
        const res = await duplicateSocialPostAction(p.id);
        if (!res.ok || !res.data) return toast(res.error ?? 'Não foi possível copiar.', 'error');
        firstId = firstId ?? res.data.id;
      }
      toast('Cópia criada como rascunho.', 'success');
      router.refresh();
      if (firstId) onOpen(firstId);
    });
  }

  const link = current?.linkUrl.trim() || null;
  const utmExample = link && utmAuto && currentAccount ? withUtm(link, { provider, postId: current?.post?.id ?? 'id-do-post', topic }) : null;
  const title = isNew ? 'Novo post' : first?.isIdea ? 'Ideia' : 'Editar post';
  const post = current?.post ?? null;
  const currentIssues = current ? issuesOf(current) : null;
  const currentErrors = Object.keys(currentIssues?.errors ?? {}).length;

  return (
    <Drawer
      open
      size="wide"
      title={title}
      onClose={onClose}
      bodyClassName="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:grid-rows-1"
      headerActions={
        !isNew && (
          <Menu label="Mais ações">
            <MenuItem>
              <button type="button" onClick={duplicateAll} disabled={pending}>
                <Copy className="h-4 w-4" /> Duplicar
              </button>
            </MenuItem>
          </Menu>
        )
      }
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {errorCount > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-danger">
              <CircleAlert className="h-3.5 w-3.5" /> {errorCount} ponto(s) a corrigir antes de aprovar
            </p>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {post && currentAccount && (
              <SocialPostActions
                id={post.id}
                status={post.status}
                provider={post.account.provider}
                accountName={post.account.displayName}
                scheduledAt={post.scheduledAt}
                canApprove={currentErrors === 0 && post.account.isActive && !post.isIdea}
                blockedReason={dirty ? 'Guarde as alterações antes de aprovar.' : post.isIdea ? 'Passe a ideia a rascunho antes de aprovar.' : null}
                externalUrl={post.externalUrl}
                onDone={() => router.refresh()}
                access={post.account.access}
                reviewState={post.review.state}
              />
            )}
            {(isNew || first?.isIdea) && (
              <Button size="sm" variant="secondary" onClick={() => save(true)} disabled={pending || variants.length === 0}>
                <Lightbulb className="h-3.5 w-3.5" /> {isNew ? 'Guardar como ideia' : 'Guardar ideia'}
              </Button>
            )}
            <Button
              size="sm"
              variant={!isNew && !first?.isIdea && !dirty ? 'secondary' : 'primary'}
              onClick={() => save(false)}
              loading={pending}
              disabled={variants.length === 0 || (!isNew && !first?.isIdea && !dirty)}
            >
              {isNew ? 'Guardar rascunho' : first?.isIdea ? 'Passar a rascunho' : 'Guardar'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto border-b border-border p-5 lg:border-b-0 lg:border-r">
        <Field
          label="Publicar em"
          required
          error={fieldErrors.socialAccountId}
          hint={isNew ? 'Cada rede escolhida vira um post separado, com o seu texto.' : undefined}
        >
          {isNew ? (
            <MultiSelect
              aria-label="Publicar em"
              value={accountOptions.filter((o) => variants.some((v) => v.accountId === o.value))}
              onChange={(next) => setNetworks(next.map((o) => o.value))}
              options={accountOptions}
              placeholder={usable.length ? 'Escolha as redes' : 'Sem contas: ligue a sua em Configurações'}
            />
          ) : (
            <Select
              aria-label="Publicar em"
              value={current?.accountId ?? ''}
              onChange={(e) => current && patch(current.key, { accountId: e.target.value })}
              options={accountOptions}
              disabled={!current || !editable(current)}
            />
          )}
        </Field>

        {variants.length > 1 && (
          <VariantTabs
            activeKey={current?.key ?? null}
            onSelect={setActiveKey}
            tabs={variants.map((v) => {
              const a = accountOf(v);
              return {
                key: v.key,
                label: a ? PROVIDER_LABEL[a.provider] : 'Rede',
                provider: a?.provider ?? 'LINKEDIN',
                accountName: a?.displayName ?? 'Conta',
                avatarUrl: a?.avatarUrl ?? null,
                state: v.post?.state ?? null,
                errors: editable(v) ? Object.keys(issuesOf(v)?.errors ?? {}).length : 0,
                dirty: !!v.post && editable(v) && isDirty(v),
              };
            })}
          />
        )}

        {post && <VariantNotices post={post} editable={editable(current!)} />}

        {current && !editable(current) ? (
          post && <ReadOnlyVariant post={post} />
        ) : (
          current && (
            <VariantFields
              placement={current.placement}
              text={current.text}
              media={current.media}
              linkUrl={current.linkUrl}
              when={current.when}
              provider={provider}
              multi={variants.length > 1}
              errors={fieldErrors}
              bestSlots={bestSlots}
              copyFrom={variants
                .filter((v) => v.key !== current.key && v.text.trim())
                .slice(0, 1)
                .map((v) => ({ provider: accountOf(v)?.provider ?? 'LINKEDIN', text: v.text, media: v.media }))[0] ?? null}
              onChange={(change) => patch(current.key, change)}
            />
          )
        )}

        <SharedFields
          multi={variants.length > 1}
          utmAuto={utmAuto}
          onUtm={setUtmAuto}
          utmExample={utmExample}
          topic={topic}
          onTopic={setTopic}
          topics={topics}
          sourceId={sourceId}
          onSource={setSourceId}
          articles={articles}
          error={fieldErrors.sourceContentPostId}
        />
      </div>

      <div className="min-h-0 overflow-y-auto bg-background p-5">
        <ComposerPreviews
          activeKey={current?.key ?? null}
          onSelect={setActiveKey}
          variants={variants.map((v) => {
            const a = accountOf(v);
            return {
              key: v.key,
              provider: a?.provider ?? 'LINKEDIN',
              accountName: a?.displayName ?? 'Conta',
              avatarUrl: a?.avatarUrl ?? null,
              text: v.text,
              media: v.media,
              linkUrl: v.linkUrl.trim() || null,
              placement: v.placement,
            };
          })}
        />
      </div>
    </Drawer>
  );
}
