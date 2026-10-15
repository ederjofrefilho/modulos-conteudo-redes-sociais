import type { LucideIcon } from 'lucide-react';
import { Button, LinkButton, type ButtonProps, type LinkButtonProps } from './Button';
import { Tooltip } from './Tooltip';
import { cn } from '@/lib/cn';

/**
 * Ação secundária de uma linha de ferramentas: só o ícone (32×32), com o
 * nome numa dica e no `aria-label`. A ação principal da tela continua a ser
 * um `<Button>` com texto.
 */
export function IconButton({
  label,
  icon: Icon,
  variant = 'secondary',
  tipAlign = 'center',
  className,
  ...props
}: Omit<ButtonProps, 'children' | 'size'> & {
  label: string;
  icon: LucideIcon;
  tipAlign?: 'center' | 'end';
}) {
  return (
    <Tooltip label={label} align={tipAlign}>
      <Button variant={variant} size="sm" aria-label={label} className={cn('w-8 px-0!', className)} {...props}>
        {!props.loading && <Icon className="h-4 w-4" />}
      </Button>
    </Tooltip>
  );
}

/** O mesmo, mas navega. */
export function IconLinkButton({
  label,
  icon: Icon,
  variant = 'secondary',
  tipAlign = 'center',
  className,
  ...props
}: Omit<LinkButtonProps, 'children' | 'size'> & {
  label: string;
  icon: LucideIcon;
  tipAlign?: 'center' | 'end';
}) {
  return (
    <Tooltip label={label} align={tipAlign}>
      <LinkButton variant={variant} size="sm" aria-label={label} className={cn('w-8 px-0!', className)} {...props}>
        <Icon className="h-4 w-4" />
      </LinkButton>
    </Tooltip>
  );
}
