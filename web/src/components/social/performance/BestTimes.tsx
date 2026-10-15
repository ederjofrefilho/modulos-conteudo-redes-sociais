'use client';

import { Clock } from 'lucide-react';
import type { socialMetrics } from '@app/social';
import { MIN_POSTS_FOR_SUGGESTION } from '@app/social/analyze';
import { EmptyState } from '@/components/ui';
import { formatCount, formatRate } from '../PostBits';

type Cell = socialMetrics.SocialReport['heatmap'][number];

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const FULL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06h–23h: fora disto quase não se publica
// Uma só cor, do claro ao escuro (magnitude): cinco degraus de opacidade do mesmo token.
const STEPS = ['opacity-15', 'opacity-30', 'opacity-50', 'opacity-75', 'opacity-100'];

/**
 * Mapa dia da semana × hora da publicação (fuso de Brasília), com todo o
 * histórico medido — não só o período filtrado, para a amostra não ficar
 * minúscula. A cor é a taxa de engagement dos posts publicados naquela hora;
 * a dica de cada célula diz quantos posts sustentam a leitura.
 */
export function BestTimes({ cells, best, measured }: { cells: Cell[]; best: Cell[]; measured: number }) {
  if (cells.length === 0) {
    return (
      <EmptyState
        size="inline"
        icon={Clock}
        title="Ainda sem dados para sugerir horários"
        description="O mapa precisa de posts publicados com métricas. A partir de 5, o composer passa a sugerir os melhores horários."
      />
    );
  }
  const score = (c: Cell) => (c.rate !== null ? c.rate : c.interactions / c.posts);
  const max = Math.max(...cells.map(score), 0.0001);
  const byKey = new Map(cells.map((c) => [`${c.weekday}:${c.hour}`, c]));
  const outside = cells.filter((c) => c.hour < HOURS[0]!).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        {best.length > 0 ? (
          <>
            Melhores horários:{' '}
            <span className="text-foreground">
              {best.map((b) => `${FULL[b.weekday]} às ${String(b.hour).padStart(2, '0')}h`).join(', ')}
            </span>
            . O composer sugere estes horários.
          </>
        ) : (
          `Amostra pequena (${measured} post(s) medido(s)): o composer só sugere horários a partir de ${MIN_POSTS_FOR_SUGGESTION}.`
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr>
              <th />
              {HOURS.map((h) => (
                <th key={h} className="w-7 font-normal tabular-nums text-muted">
                  {String(h).padStart(2, '0')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((label, weekday) => (
              <tr key={label}>
                <th className="pr-2 text-left font-normal text-muted">{label}</th>
                {HOURS.map((hour) => {
                  const cell = byKey.get(`${weekday}:${hour}`);
                  if (!cell) return <td key={hour} className="h-7 w-7 rounded bg-surface-2" />;
                  const step = STEPS[Math.min(STEPS.length - 1, Math.floor((score(cell) / max) * STEPS.length))]!;
                  const title = `${FULL[weekday]} às ${String(hour).padStart(2, '0')}h: ${cell.posts} post(s), taxa ${formatRate(cell.rate)}, ${formatCount(cell.interactions)} interações`;
                  return (
                    <td key={hour} title={title} aria-label={title} className="relative h-7 w-7 overflow-hidden rounded bg-surface-2 text-center">
                      <span className={`absolute inset-0 bg-accent ${step}`} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted">
        Taxa de engagement: menor
        <span className="flex gap-0.5">
          {STEPS.map((s) => (
            <span key={s} className="relative h-3 w-5 overflow-hidden rounded-sm bg-surface-2">
              <span className={`absolute inset-0 bg-accent ${s}`} />
            </span>
          ))}
        </span>
        maior · passe o rato numa célula para ver os números{outside > 0 ? ` · ${outside} horário(s) antes das 6h não aparecem` : ''}
      </p>
    </div>
  );
}
