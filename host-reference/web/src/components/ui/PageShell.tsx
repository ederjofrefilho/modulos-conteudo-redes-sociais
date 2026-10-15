import { cn } from '@/lib/cn';

/**
 * Larguras de página (DESIGN.md §5): a mesma classe de tela usa sempre a
 * mesma largura — inconsistência entre telas irmãs é bug.
 * - `full`: listas, Kanban, e-mail, mapa (o teto de 1680px vem do layout).
 * - `wide`: Início (painel de trabalho com coluna lateral).
 * - `content`: fichas de conta/contato/negócio, configurações, sequências.
 * - `narrow`: formulários de edição e importação.
 */
const WIDTHS = {
  full: 'max-w-[1680px]',
  wide: 'max-w-7xl',
  content: 'max-w-5xl',
  narrow: 'max-w-2xl',
} as const;

export type PageWidth = keyof typeof WIDTHS;

/**
 * Esqueleto de toda página de `(app)`: largura e respiro lateral
 * (`px-4 sm:px-6 md:px-8`) num lugar só. Vem antes do `<PageHeader>`, que não
 * tem padding lateral próprio.
 *
 * A PÁGINA nunca rola (o `<main>` do layout é `overflow-hidden`):
 * - `fill`: a tela ocupa exatamente a altura disponível e organiza a própria
 *   região de rolagem (corpo de tabela, colunas do Kanban, painéis do e-mail).
 * - padrão: o `PageShell` é a ÚNICA região de rolagem da tela, com o
 *   `<PageHeader>` fixo no topo (`sticky`). É o último recurso para conteúdo
 *   longo (formulários, configurações) — nunca aninhe outra rolagem dentro.
 *
 * `bleed` tira o respiro lateral (editor de post em tela cheia).
 */
export function PageShell({
  width = 'full',
  fill = false,
  bleed = false,
  className,
  children,
}: {
  width?: PageWidth;
  fill?: boolean;
  bleed?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const inner = cn('mx-auto flex w-full flex-col', WIDTHS[width], !bleed && 'px-4 sm:px-6 md:px-8');
  if (fill) return <div className={cn(inner, 'h-full min-h-0', className)}>{children}</div>;
  return (
    <div data-page-scroll className="h-full scroll-pb-24 overflow-y-auto overflow-x-hidden">
      <div className={cn(inner, 'min-h-full pb-8', className)}>{children}</div>
    </div>
  );
}
