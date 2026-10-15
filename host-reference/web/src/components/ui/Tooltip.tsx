import { cn } from '@/lib/cn';

/**
 * Dica curta para controles só com ícone. CSS puro (aparece no hover e no
 * foco por teclado do filho, some sem JavaScript) — o nome acessível continua
 * sendo o `aria-label` do próprio controle; a dica é `aria-hidden` para o
 * leitor de tela não ler duas vezes.
 */
export function Tooltip({
  label,
  side = 'bottom',
  align = 'center',
  wide = false,
  className,
  children,
}: {
  label: string;
  side?: 'top' | 'bottom' | 'right';
  /** `end` alinha a dica à direita do controle (junto à borda da tela). */
  align?: 'center' | 'end';
  /** Texto longo (descrição de uma tela): largura fixa e quebra de linha. */
  wide?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const cross = wide ? 'left-0' : align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2';
  const position = {
    top: `bottom-full mb-1.5 ${cross}`,
    bottom: `top-full mt-1.5 ${cross}`,
    right: 'left-full top-1/2 ml-2 -translate-y-1/2',
  }[side];
  return (
    <span className={cn('group/tip relative inline-flex', className)}>
      {children}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute z-50 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-[var(--shadow-md)] transition-opacity delay-300 duration-150 group-focus-within/tip:opacity-100 group-hover/tip:opacity-100',
          wide ? 'w-72 max-w-[80vw] whitespace-normal text-left leading-snug' : 'whitespace-nowrap',
          position,
        )}
      >
        {label}
      </span>
    </span>
  );
}
