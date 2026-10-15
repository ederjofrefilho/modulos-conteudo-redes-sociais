import { cn } from '@/lib/cn';
import type { PageTab } from '@/lib/page-chrome';
import { PageChrome } from './PageChrome';

/**
 * Cabeçalho único de toda página de `(app)`: UMA linha de ferramentas de
 * 56px (12 + 32 + 12), com filtros à esquerda e ações à direita.
 *
 * O título da página é a trilha da barra superior — aqui o `title` vira um
 * `<h1>` só para leitor de tela, exceto nas fichas (`leading` ou
 * `showTitle`), onde o nome do registro fica na linha junto de `badges` e
 * `meta`. O texto explicativo (`description`) e as abas de páginas irmãs
 * (`tabs`) sobem para a barra superior; nunca ocupam altura aqui.
 *
 * Sem nada para mostrar, o cabeçalho é só o respiro de 12px acima do
 * conteúdo — o mesmo em todas as telas. Sem padding lateral: quem dá é o
 * `<PageShell>` em volta.
 */
export function PageHeader({
  title,
  description,
  tabs,
  showTitle = false,
  leading,
  badges,
  meta,
  filters,
  actions,
  className,
}: {
  /** Nome da página (leitor de tela) ou do registro (visível nas fichas). */
  title: string;
  /** Explicação da tela: ícone de informação ao lado da trilha, na barra superior. */
  description?: string;
  /** Páginas irmãs, como abas na barra superior. */
  tabs?: PageTab[];
  /** Mostra o título na linha mesmo sem `leading` (ficha sem avatar). */
  showTitle?: boolean;
  /** Elemento à esquerda do título (avatar da ficha). */
  leading?: React.ReactNode;
  /** Badges de estado ao lado do título ou dos filtros (etapa, modo simulação). */
  badges?: React.ReactNode;
  /** Dado curto da tela (contagem, período) ou links da ficha, em texto discreto. */
  meta?: React.ReactNode;
  /** Busca e filtros, à esquerda. */
  filters?: React.ReactNode;
  /** Ações, à direita: no máximo duas visíveis, o resto num `<Menu>`. */
  actions?: React.ReactNode;
  className?: string;
}) {
  const visibleTitle = showTitle || !!leading;
  const chrome = (tabs?.length || description) && <PageChrome tabs={tabs} description={description} />;
  const empty = !visibleTitle && !badges && !meta && !filters && !actions;

  if (empty) {
    return (
      <header className={cn('h-3 shrink-0', className)}>
        {chrome}
        <h1 className="sr-only">{title}</h1>
      </header>
    );
  }

  return (
    <header
      className={cn(
        'z-20 flex h-14 shrink-0 items-center gap-3 bg-background lg:sticky lg:top-0',
        className,
      )}
    >
      {chrome}
      {/* O grupo da esquerda encolhe e, em telas estreitas, rola na
          horizontal sem barra: a linha nunca quebra em duas. O respiro
          interno (-m/p) deixa o anel de foco aparecer. */}
      <div className="no-scrollbar -m-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto p-1">
        {leading}
        <h1
          className={
            visibleTitle ? 'min-w-0 shrink truncate text-base font-semibold text-foreground' : 'sr-only'
          }
        >
          {title}
        </h1>
        {badges && <div className="flex shrink-0 items-center gap-1.5">{badges}</div>}
        {filters}
        {meta && (
          <div className="flex shrink-0 items-center gap-x-3 whitespace-nowrap text-13 text-muted">
            {meta}
          </div>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
