import { cn } from '@/lib/cn';

// Paleta determinística de cores para avatares (baseada no nome). Tokens
// próprios (`--avatar-1..5`, globals.css) em vez de --blue/--teal/--crimson,
// que mudam de valor no dark mode — um avatar precisa do mesmo preenchimento
// em qualquer tema, e as iniciais brancas ficam >= 4,5:1 em todos.
const COLORS = ['bg-avatar-1', 'bg-avatar-2', 'bg-avatar-3', 'bg-avatar-4', 'bg-avatar-5'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length]!;
}

export function Avatar({
  name,
  size = 'md',
  square = false,
  style,
}: {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  square?: boolean;
  /** Ex.: `{ viewTransitionName: 'contact-avatar-123' }` pra morfar entre lista e detalhe. */
  style?: React.CSSProperties;
}) {
  const sizes = {
    xs: 'h-4 w-4 text-[8px]',
    sm: 'h-6 w-6 text-[10px]',
    md: 'h-8 w-8 text-xs',
    lg: 'h-11 w-11 text-sm',
  };
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-semibold text-avatar-foreground',
        square ? 'rounded-lg' : 'rounded-full',
        sizes[size],
        colorFor(name || '?'),
      )}
      style={style}
      aria-hidden
    >
      {initials(name || '?')}
    </span>
  );
}
