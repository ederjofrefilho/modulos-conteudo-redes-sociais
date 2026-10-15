'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { DISPLAY_LABEL } from '@app/social/status';
import { PROVIDER_LABEL } from '@app/social/rules';
import { Button, Segmented, useToast } from '@/components/ui';
import { rescheduleSocialPostAction } from '@/app/(app)/social/actions';
import { cn } from '@/lib/cn';
import { NetworkIcon, PostThumb, STATE_DOT, STATE_ORDER, localDayKey, snippet, timeLabel } from './PostBits';
import { AccountAvatar } from './AccountAvatar';
import { canReschedule, postDate, type WorkspaceGroup } from './types';

type Mode = 'mes' | 'semana';
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const UNDATED = 'sem-data';
// Altura de um chip do mês (20px) + intervalo; cabeçalho do dia + respiro da célula.
// Baixo o bastante para dois ou três posts do mesmo dia ficarem empilhados à vista.
const CHIP_SLOT = 22;
const CELL_CHROME = 34;

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d: Date) => addDays(d, -d.getDay());

/**
 * Calendário de posts (mês ou semana). Cada post aparece no dia em que saiu
 * ou está marcado, com o ícone da rede e a cor do estado. Arrastar para outro
 * dia muda só a DATA (a hora mantém-se; sem hora, 09:00) — vale para ideia,
 * rascunho e agendado; publicado e falhado não se movem. Os posts sem data
 * ficam na coluna "Sem data" e arrastam-se para um dia.
 */
export function SocialCalendar({
  posts,
  onOpen,
  onNew,
}: {
  posts: WorkspaceGroup[];
  onOpen: (id: string) => void;
  onNew: (date?: string) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>('mes');
  const [anchor, setAnchor] = useState(() => new Date());
  // Movimento otimista: id → nova data ISO, até o servidor devolver a lista nova.
  const [moved, setMoved] = useState<Record<string, string>>({});
  // Quantos chips cabem numa célula do mês depende da altura do ecrã (a página não rola).
  const gridRef = useRef<HTMLDivElement>(null);
  const [perCell, setPerCell] = useState(2);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => setPerCell(Math.max(1, Math.floor((el.clientHeight / 6 - CELL_CHROME) / CHIP_SLOT)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const days = useMemo(() => {
    if (mode === 'semana') return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
    const first = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [mode, anchor]);

  const { byDay, undated } = useMemo(() => {
    const map = new Map<string, WorkspaceGroup[]>();
    const none: WorkspaceGroup[] = [];
    for (const p of posts) {
      const iso = moved[p.id] ?? postDate(p);
      if (!iso) {
        none.push(p);
        continue;
      }
      const key = localDayKey(new Date(iso));
      map.set(key, [...(map.get(key) ?? []), { ...p, scheduledAt: p.publishedAt ? p.scheduledAt : iso }]);
    }
    for (const list of map.values()) list.sort((a, b) => (postDate(a) ?? '').localeCompare(postDate(b) ?? ''));
    return { byDay: map, undated: none };
  }, [posts, moved]);

  const todayKey = localDayKey(new Date());
  const title =
    mode === 'mes'
      ? anchor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      : `${days[0]!.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${days[6]!.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  function shift(delta: number) {
    setAnchor((a) => (mode === 'mes' ? new Date(a.getFullYear(), a.getMonth() + delta, 1) : addDays(a, delta * 7)));
  }

  // Arrastar uma publicação muda o DIA de todas as versões que se podem mover; cada uma mantém a sua hora.
  function onDragEnd(event: DragEndEvent) {
    const post = posts.find((p) => p.id === event.active.id);
    const dayKey = event.over?.id as string | undefined;
    if (!post || !dayKey || dayKey === UNDATED) return;
    const current = moved[post.id] ?? post.scheduledAt;
    if (current && localDayKey(new Date(current)) === dayKey) return;
    const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
    const at = (iso: string | null) => {
      const base = iso ? new Date(iso) : null;
      return new Date(y, m - 1, d, base?.getHours() ?? 9, base?.getMinutes() ?? 0);
    };
    const next = at(current);
    const movable = post.variants.filter((v) => canReschedule(v));
    if (movable.some((v) => at(v.scheduledAt).getTime() <= Date.now())) {
      toast('Escolha um dia e hora no futuro.', 'error');
      return;
    }
    const iso = next.toISOString();
    setMoved((prev) => ({ ...prev, [post.id]: iso }));
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof rescheduleSocialPostAction>> = { ok: true };
      for (const v of movable) {
        res = await rescheduleSocialPostAction(v.id, at(v.scheduledAt).toISOString());
        if (!res.ok) break;
      }
      if (!res.ok) {
        setMoved(({ [post.id]: _undo, ...rest }) => rest);
        toast(res.error ?? 'Não foi possível mudar a data.', 'error');
        router.refresh();
        return;
      }
      toast(
        `${post.state === 'SCHEDULED' || post.state === 'QUEUED' ? 'Reagendado' : 'Data sugerida'}: ${next.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}.`,
        'success',
      );
      router.refresh();
    });
  }

  const usedStates = STATE_ORDER.filter((s) => posts.some((p) => p.state === s));

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setAnchor(new Date())}>
            Hoje
          </Button>
          <Button size="sm" variant="ghost" aria-label="Anterior" onClick={() => shift(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" aria-label="Seguinte" onClick={() => shift(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-semibold capitalize text-foreground">{title}</h2>
          <ul className="ml-2 hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted lg:flex">
            {usedStates.map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', STATE_DOT[s])} /> {DISPLAY_LABEL[s]}
              </li>
            ))}
          </ul>
          <Segmented
            className="ml-auto"
            label="Período do calendário"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'mes', label: 'Mês' },
              { value: 'semana', label: 'Semana' },
            ]}
          />
        </div>

        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
            <div className="grid shrink-0 grid-cols-7 border-b border-border">
              {WEEKDAYS.map((w) => (
                <div key={w} className="px-2 py-1.5 text-xs font-medium text-muted">
                  {w}
                </div>
              ))}
            </div>
            <div ref={gridRef} className={cn('grid min-h-0 flex-1 grid-cols-7', mode === 'mes' ? 'grid-rows-6' : 'grid-rows-1')}>
              {days.map((day) => {
                const key = localDayKey(day);
                return (
                  <DayCell
                    key={key}
                    dayKey={key}
                    day={day}
                    posts={byDay.get(key) ?? []}
                    dim={mode === 'mes' && day.getMonth() !== anchor.getMonth()}
                    today={key === todayKey}
                    past={key < todayKey}
                    compact={mode === 'mes'}
                    limit={perCell}
                    onOpen={onOpen}
                    onNew={onNew}
                    onMore={() => {
                      setAnchor(day);
                      setMode('semana');
                    }}
                  />
                );
              })}
            </div>
          </div>

          {undated.length > 0 && <UndatedColumn posts={undated} onOpen={onOpen} />}
        </div>
      </div>
    </DndContext>
  );
}

function DayCell({
  dayKey,
  day,
  posts,
  dim,
  today,
  past,
  compact,
  limit,
  onOpen,
  onNew,
  onMore,
}: {
  dayKey: string;
  day: Date;
  posts: WorkspaceGroup[];
  dim: boolean;
  today: boolean;
  past: boolean;
  compact: boolean;
  limit: number;
  onOpen: (id: string) => void;
  onNew: (date?: string) => void;
  onMore: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey, disabled: past });
  const shown = compact ? posts.slice(0, limit) : posts;
  const hidden = posts.length - shown.length;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group/day flex min-h-0 min-w-0 flex-col gap-1 border-b border-r border-border p-1 [&:nth-child(7n)]:border-r-0',
        dim && 'bg-surface-2/50',
        isOver && 'bg-[var(--hover)] ring-1 ring-inset ring-[var(--ring)]',
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-1">
        <span
          className={cn(
            'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs tabular-nums',
            today ? 'bg-primary font-semibold text-primary-foreground' : dim ? 'text-muted/70' : 'text-muted',
          )}
        >
          {day.getDate()}
        </span>
        {hidden > 0 && (
          <button type="button" onClick={onMore} className="ml-auto mr-1 rounded px-1 text-xs text-muted hover:text-foreground" title="Ver a semana deste dia">
            +{hidden} mais
          </button>
        )}
        {!past && (
          <button
            type="button"
            aria-label={`Novo post em ${day.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}`}
            onClick={() => onNew(`${dayKey}T09:00`)}
            className="flex h-5 w-5 items-center justify-center rounded text-muted opacity-0 transition-opacity hover:bg-[var(--hover)] hover:text-foreground focus-visible:opacity-100 group-hover/day:opacity-100"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className={cn('flex min-h-0 flex-1 flex-col gap-1', compact ? 'overflow-hidden' : 'overflow-y-auto')}>
        {shown.map((p) => (
          <PostChip key={p.id} post={p} detailed={!compact} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function PostChip({ post, detailed, onOpen }: { post: WorkspaceGroup; detailed?: boolean; onOpen: (id: string) => void }) {
  const draggable = post.variants.some((v) => canReschedule(v));
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: post.id, disabled: !draggable });
  const iso = postDate(post);
  const label = `${post.variants.map((v) => `${PROVIDER_LABEL[v.account.provider]} ${DISPLAY_LABEL[v.state]}`).join(', ')}${iso ? `, ${timeLabel(iso)}` : ''}: ${snippet(post.text, 60)}`;
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => onOpen(post.id)}
      aria-label={label}
      title={snippet(post.text, 140)}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        'flex w-full min-w-0 shrink-0 gap-1.5 rounded-md bg-surface-2 px-1.5 text-left text-xs text-foreground transition-colors hover:bg-[var(--active)]',
        detailed ? 'flex-col py-1' : 'items-center py-0.5',
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        (post.state === 'IDEA' || post.state === 'DRAFT') && 'outline-dashed outline-1 -outline-offset-1 outline-border-strong',
        isDragging && 'relative z-20 opacity-90 shadow-[var(--shadow-raised)]',
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', STATE_DOT[post.state])} />
        {post.variants.map((v) => (
          <span key={v.id} className="flex shrink-0 items-center gap-0.5" title={`${v.account.displayName} · ${DISPLAY_LABEL[v.state]}`}>
            <AccountAvatar name={v.account.displayName} avatarUrl={v.account.avatarUrl} provider={v.account.provider} size="xs" />
            <NetworkIcon provider={v.account.provider} className="text-muted" />
          </span>
        ))}
        {iso && <span className="shrink-0 tabular-nums text-muted">{timeLabel(iso)}</span>}
        {!detailed && <span className="min-w-0 flex-1 truncate">{snippet(post.text, 40)}</span>}
        {!detailed && post.thumbUrl && <PostThumb url={post.thumbUrl} className="h-4 w-4 rounded-sm" />}
        {detailed && <span className="truncate text-muted">{DISPLAY_LABEL[post.state]}</span>}
      </span>
      {detailed && post.thumbUrl && <PostThumb url={post.thumbUrl} className="h-20 w-full rounded-md" />}
      {detailed && <span className="line-clamp-3 leading-snug">{snippet(post.text, 120)}</span>}
    </button>
  );
}

function UndatedColumn({ posts, onOpen }: { posts: WorkspaceGroup[]; onOpen: (id: string) => void }) {
  const { setNodeRef } = useDroppable({ id: UNDATED });
  return (
    <aside ref={setNodeRef} className="hidden min-h-0 w-56 shrink-0 flex-col gap-2 rounded-xl border border-border bg-surface p-2 lg:flex">
      <div>
        <p className="text-xs font-semibold text-foreground">Sem data ({posts.length})</p>
        <p className="text-xs text-muted">Arraste para um dia.</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {posts.map((p) => (
          <PostChip key={p.id} post={p} detailed onOpen={onOpen} />
        ))}
      </div>
    </aside>
  );
}
