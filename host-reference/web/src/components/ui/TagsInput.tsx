'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Campo de tags/chips — Enter, vírgula ou Tab confirma o texto digitado como
 * uma tag; colar um texto com vírgulas separa em várias de uma vez (resolve
 * o hábito de digitar "React, Node, Postgres" numa linha só). Backspace com
 * o campo de digitação vazio apaga a última tag.
 */
export function TagsInput({
  value,
  onChange,
  placeholder = 'Digite e pressione Enter...',
  disabled,
  className,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState('');

  function commit(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    if (value.some((v) => v.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  }

  function commitDraft() {
    if (!draft.trim()) return;
    commit(draft);
    setDraft('');
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div
      className={cn(
        'flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-lg bg-surface ring-1 ring-inset ring-field-border px-2 py-1.5 outline-none transition-shadow duration-150 focus-within:ring-2 focus-within:ring-[var(--ring-field)]',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {value.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="inline-flex h-6 items-center gap-1 rounded-md bg-surface-2 pl-2 pr-0.5 text-xs font-medium text-foreground"
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="flex h-5 w-5 items-center justify-center rounded text-muted transition-colors duration-150 hover:bg-border hover:text-foreground"
              aria-label={`Remover ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      <input
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
            if (draft.trim()) {
              e.preventDefault();
              commitDraft();
            }
          } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
            removeAt(value.length - 1);
          }
        }}
        onBlur={commitDraft}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text');
          if (!text.includes(',')) return;
          e.preventDefault();
          text
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach(commit);
          setDraft('');
        }}
        placeholder={value.length === 0 ? placeholder : ''}
        className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-foreground outline-none placeholder:text-muted"
      />
    </div>
  );
}
