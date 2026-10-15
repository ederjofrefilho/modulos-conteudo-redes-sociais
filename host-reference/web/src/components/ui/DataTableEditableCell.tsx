'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { Input } from './Input';
import { Select } from './select/Select';
import { DatePicker } from './DatePicker';
import { useToast } from './Toast';
import { cn } from '@/lib/cn';
import type { DataTableEditable } from './DataTable';

/** Célula editável inline do `DataTable` (salva no blur/Enter, desfaz no erro). */
export function EditableCell({
  editable,
  fallback,
}: {
  editable: DataTableEditable;
  fallback: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(editable.value);
  const [override, setOverride] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function commit() {
    setEditing(false);
    if (value === editable.value) return;
    const previous = override;
    setOverride(value);
    startTransition(async () => {
      const result = await editable.onSave(value);
      if (!result.ok) {
        setOverride(previous);
        toast(result.error ?? 'Não foi possível salvar', 'error');
      }
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(override ?? editable.value);
          setEditing(true);
        }}
        className={cn(
          'w-full rounded px-1 py-0.5 text-left transition-colors hover:bg-surface-2',
          pending && 'opacity-50',
        )}
      >
        {override !== null ? renderOverrideLabel(editable, override) : fallback}
      </button>
    );
  }

  const commonProps = {
    autoFocus: true,
    value,
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') setEditing(false);
    },
  };

  if (editable.type === 'select') {
    return (
      <Select inputSize="sm" {...commonProps} onChange={(e) => setValue(e.target.value)}>
        {editable.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    );
  }
  if (editable.type === 'date') {
    return <DatePicker {...commonProps} onChange={(e) => setValue(e.target.value)} />;
  }
  return (
    <Input
      inputSize="sm"
      type={editable.type === 'number' ? 'number' : 'text'}
      {...commonProps}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

function renderOverrideLabel(editable: DataTableEditable, value: string) {
  if (editable.type === 'select') {
    return editable.options?.find((o) => o.value === value)?.label ?? value;
  }
  return value || '—';
}
