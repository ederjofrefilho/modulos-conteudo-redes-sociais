'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Info, RefreshCw } from 'lucide-react';
import type { socialMetrics } from '@app/social';
import { FORMAT_LABEL, type PostFormat } from '@app/social/metrics';
import {
  Badge,
  Button,
  DateRangePicker,
  FilterChip,
  FilterField,
  FiltersPopover,
  Menu,
  MenuItem,
  PageHeader,
  Segmented,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from '@/components/ui';
import type { PageTab } from '@/lib/page-chrome';
import { ExportCsvButton } from '@/components/ExportCsvButton';
import { exportSocialReportCsvAction, refreshSocialMetricsAction } from '@/app/(app)/social/actions';
import { KpiStrip } from './KpiStrip';
import { TrendChart } from './TrendChart';
import { Breakdown, Rankings } from './Breakdown';
import { BestTimes } from './BestTimes';
import { PostsTable } from './PostsTable';
import { PostPerformanceDrawer } from './PostPerformanceDrawer';
import { CapabilityDialog, type Capability } from './CapabilityDialog';

type Report = socialMetrics.SocialReport;

export interface DashboardFilters {
  from: string;
  to: string;
  provider?: 'LINKEDIN' | 'INSTAGRAM';
  format?: PostFormat;
  topic?: string;
  preset: string;
}

const PRESETS = [
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
  { value: '365', label: '12m' },
];

/**
 * Painel de desempenho. A página não rola: a linha de ferramentas (o
 * `<PageHeader>`, desenhado aqui porque os filtros são do cliente) e os KPIs
 * são faixas fixas;
 * por baixo, os gráficos ficam em abas (um de cada vez) e a tabela de posts é
 * a única região com rolagem. Os filtros vivem na URL (o servidor refaz o
 * relatório), por isso um link leva sempre à mesma leitura.
 */
export function PerformanceDashboard({
  report,
  filters,
  topics,
  capabilities,
  initialPostId,
  today,
  tabs,
  description,
  badges,
}: {
  /** Hoje (fuso do relatório), limite do seletor de intervalo. */
  today: string;
  /** Peças do cabeçalho que vêm do servidor: abas irmãs, descrição e selos. */
  tabs: PageTab[];
  description: string;
  badges?: React.ReactNode;
  report: Report;
  filters: DashboardFilters;
  topics: string[];
  capabilities: Capability[];
  initialPostId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [navigating, startNavigation] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [openPost, setOpenPost] = useState<string | null>(initialPostId);
  const [capsOpen, setCapsOpen] = useState(false);

  function go(patch: Record<string, string | undefined>) {
    const current: Record<string, string | undefined> = {
      periodo: filters.preset === 'custom' ? undefined : filters.preset,
      de: filters.preset === 'custom' ? filters.from : undefined,
      ate: filters.preset === 'custom' ? filters.to : undefined,
      rede: filters.provider,
      formato: filters.format,
      tema: filters.topic,
    };
    const next = { ...current, ...patch };
    if (next.periodo === '30') next.periodo = undefined;
    const sp = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => !!e[1]));
    startNavigation(() => router.push(sp.size ? `${pathname}?${sp}` : pathname));
  }

  function refresh() {
    startRefresh(async () => {
      const res = await refreshSocialMetricsAction();
      if (!res.ok || !res.data) {
        toast(res.error ?? 'Não foi possível atualizar as métricas.', 'error');
        return;
      }
      const { collected, accounts, failed, rateLimited, firstError } = res.data;
      if (failed > 0 && firstError) toast(`${collected} post(s) atualizado(s); ${failed} com erro: ${firstError}`, 'error');
      else if (rateLimited.length) toast('A rede limitou as chamadas por agora. O que faltou entra na próxima recolha.', 'error');
      else if (collected === 0 && accounts === 0) toast('Nada de novo para recolher (sem posts publicados medíveis ou sem permissão).', 'success');
      else toast(`Métricas atualizadas: ${collected} post(s) e ${accounts} conta(s).`, 'success');
      router.refresh();
    });
  }

  const missing = capabilities.filter((c) => c.isActive && c.missingScopes.length > 0);
  const exportParams = { from: filters.from, to: filters.to, provider: filters.provider, format: filters.format, topic: filters.topic };

  const activeFilters = [filters.provider, filters.format, filters.topic].filter(Boolean).length;

  return (
    <>
      <PageHeader
        title="Desempenho das redes sociais"
        description={description}
        tabs={tabs}
        badges={
          <>
            {badges}
            {missing.length > 0 && (
              <button
                type="button"
                onClick={() => setCapsOpen(true)}
                className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-field)]"
              >
                <Badge tone="warning">
                  <Info className="h-3 w-3" /> Métricas incompletas
                </Badge>
              </button>
            )}
          </>
        }
        filters={
          <>
            <Segmented
              label="Período"
              value={filters.preset}
              onChange={(v) => go({ periodo: v, de: undefined, ate: undefined })}
              options={PRESETS}
            />
            <DateRangePicker
              inputSize="sm"
              aria-label="Intervalo de datas"
              className="w-52"
              from={filters.from}
              to={filters.to}
              max={today}
              onChange={(r) => r.from && r.to && go({ periodo: undefined, de: r.from, ate: r.to })}
            />
            <FiltersPopover
              count={activeFilters}
              onClear={() => go({ rede: undefined, formato: undefined, tema: undefined })}
            >
              <FilterField label="Rede">
                <Select inputSize="sm" value={filters.provider ?? ''} onChange={(e) => go({ rede: e.target.value || undefined })}>
                  <option value="">Todas as redes</option>
                  <option value="LINKEDIN">LinkedIn</option>
                  <option value="INSTAGRAM">Instagram</option>
                </Select>
              </FilterField>
              <FilterField label="Formato">
                <Select inputSize="sm" value={filters.format ?? ''} onChange={(e) => go({ formato: e.target.value || undefined })}>
                  <option value="">Todos os formatos</option>
                  {(Object.keys(FORMAT_LABEL) as PostFormat[]).map((f) => (
                    <option key={f} value={f}>
                      {FORMAT_LABEL[f]}
                    </option>
                  ))}
                </Select>
              </FilterField>
              <FilterField label="Tema">
                <Select inputSize="sm" value={filters.topic ?? ''} onChange={(e) => go({ tema: e.target.value || undefined })}>
                  <option value="">Todos os temas</option>
                  {topics.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </FilterField>
            </FiltersPopover>
            {filters.provider && (
              <FilterChip label={filters.provider === 'LINKEDIN' ? 'LinkedIn' : 'Instagram'} onRemove={() => go({ rede: undefined })} />
            )}
            {filters.format && <FilterChip label={FORMAT_LABEL[filters.format]} onRemove={() => go({ formato: undefined })} />}
            {filters.topic && <FilterChip label={filters.topic} onRemove={() => go({ tema: undefined })} />}
          </>
        }
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={refresh} loading={refreshing}>
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar métricas
            </Button>
            <Menu label="Mais ações do painel">
              <MenuItem>
                <ExportCsvButton
                  asMenuItem
                  filename={`social-${filters.from}-a-${filters.to}.csv`}
                  params={exportParams}
                  action={exportSocialReportCsvAction}
                />
              </MenuItem>
            </Menu>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 pb-4" aria-busy={navigating}>
        <KpiStrip report={report} />

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-1">
        <Tabs defaultValue="evolucao" className="flex min-h-0 flex-col gap-2 rounded-xl border border-border bg-surface p-3">
          <TabsList className="shrink-0">
            <TabsTrigger value="evolucao">Evolução</TabsTrigger>
            <TabsTrigger value="ranking">Top e piores</TabsTrigger>
            <TabsTrigger value="formato">Formato e tema</TabsTrigger>
            <TabsTrigger value="horarios">Melhores horários</TabsTrigger>
          </TabsList>
          <TabsContent value="evolucao" className="flex min-h-0 flex-1 flex-col">
            <TrendChart series={report.series} />
          </TabsContent>
          <TabsContent value="ranking" className="min-h-0 flex-1 overflow-y-auto">
            <Rankings posts={report.posts} onOpen={setOpenPost} />
          </TabsContent>
          <TabsContent value="formato" className="min-h-0 flex-1 overflow-y-auto">
            <Breakdown byFormat={report.byFormat} byTopic={report.byTopic} />
          </TabsContent>
          <TabsContent value="horarios" className="min-h-0 flex-1 overflow-y-auto">
            <BestTimes cells={report.heatmap} best={report.bestSlots} measured={report.historyMeasured} />
          </TabsContent>
        </Tabs>

        <PostsTable posts={report.posts} onOpen={setOpenPost} />
      </div>

      <PostPerformanceDrawer postId={openPost} onClose={() => setOpenPost(null)} />
      <CapabilityDialog open={capsOpen} onClose={() => setCapsOpen(false)} capabilities={capabilities} />
      </div>
    </>
  );
}
