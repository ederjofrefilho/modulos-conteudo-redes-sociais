'use client';

import { CalendarClock, Check, ChevronDown, Eye, EyeOff, XCircle } from 'lucide-react';
import { Button, DatePicker, Popover } from '@/components/ui';
import type { ContentStatusLike } from './meta';

/** Botões de publicação da barra do `PostEditor`, conforme o status do post. */
export function PublishControls({
  status,
  pending,
  hasUnpublishedChanges,
  scheduledAt,
  onPublish,
  onUnpublish,
  onCancelSchedule,
  scheduleOpen,
  setScheduleOpen,
  scheduleValue,
  setScheduleValue,
  onSchedule,
}: {
  status: ContentStatusLike;
  pending: boolean;
  hasUnpublishedChanges: boolean;
  scheduledAt: string | null;
  onPublish: () => void;
  onUnpublish: () => void;
  onCancelSchedule: () => void;
  scheduleOpen: boolean;
  setScheduleOpen: (open: boolean) => void;
  scheduleValue: string;
  setScheduleValue: (value: string) => void;
  onSchedule: () => void;
}) {
  if (status === 'SCHEDULED') {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
          <CalendarClock className="h-3.5 w-3.5" />
          {scheduledAt
            ? new Date(scheduledAt).toLocaleString('pt-BR', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Agendado'}
        </span>
        <Button variant="secondary" size="sm" onClick={onCancelSchedule} disabled={pending}>
          <XCircle className="h-3.5 w-3.5" /> Cancelar agendamento
        </Button>
        <Button size="sm" onClick={onPublish} disabled={pending}>
          <Eye className="h-3.5 w-3.5" /> Publicar agora
        </Button>
      </div>
    );
  }

  if (status === 'PUBLISHED') {
    return (
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onUnpublish} disabled={pending}>
          <EyeOff className="h-3.5 w-3.5" /> Despublicar
        </Button>
        {hasUnpublishedChanges ? (
          <Button size="sm" onClick={onPublish} disabled={pending}>
            <Eye className="h-3.5 w-3.5" /> Atualizar publicação
          </Button>
        ) : (
          <span className="hidden items-center gap-1 text-xs text-muted sm:flex">
            <Check className="h-3.5 w-3.5 text-accent" /> Tudo publicado
          </span>
        )}
      </div>
    );
  }

  // DRAFT ou ARCHIVED
  return (
    <div className="flex items-center">
      <Button size="sm" onClick={onPublish} disabled={pending} className="rounded-r-none">
        <Eye className="h-3.5 w-3.5" /> Publicar
      </Button>
      <Popover
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        align="right"
        trigger={({ toggle }) => (
          <Button
            size="sm"
            onClick={toggle}
            disabled={pending}
            aria-label="Agendar publicação"
            className="rounded-l-none px-1.5"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        )}
      >
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-foreground">Agendar para</label>
          <DatePicker
            type="datetime-local"
            value={scheduleValue}
            onChange={(e) => setScheduleValue(e.target.value)}
          />
          <Button size="sm" onClick={onSchedule} disabled={pending}>
            <CalendarClock className="h-3.5 w-3.5" /> Agendar
          </Button>
        </div>
      </Popover>
    </div>
  );
}
