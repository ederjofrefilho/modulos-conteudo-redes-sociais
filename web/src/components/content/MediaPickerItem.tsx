'use client';

import { useState } from 'react';
import { Check, Pencil, Trash2 } from 'lucide-react';
import { ConfirmDialog, useToast } from '@/components/ui';
import { deleteContentAssetAction, updateContentAssetAltAction } from '@/app/(app)/conteudo/actions';
import { cn } from '@/lib/cn';
import { MediaThumb } from './MediaThumb';
import type { PickedAsset } from './MediaPicker';

/**
 * Um item da galeria — clique na imagem seleciona/insere; o lápis edita o
 * alt SEM reenviar o arquivo (antes só dava pra corrigir um alt errado
 * enviando o arquivo de novo, criando um duplicado no Blob).
 */
export function MediaPickerItem({
  asset,
  onSelect,
  onAltSaved,
  onDeleted,
  multiple,
  checked,
}: {
  asset: PickedAsset;
  onSelect: () => void;
  onAltSaved: (alt: string) => void;
  onDeleted: () => void;
  multiple?: boolean;
  checked?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [alt, setAlt] = useState(asset.alt);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { toast } = useToast();

  async function save() {
    if (!alt.trim()) {
      toast('O texto alternativo não pode ficar vazio.', 'error');
      return;
    }
    setSaving(true);
    const res = await updateContentAssetAltAction(asset.id, alt.trim());
    setSaving(false);
    if (res.ok) {
      onAltSaved(alt.trim());
      setEditing(false);
    } else {
      toast(res.error ?? 'Não foi possível salvar o texto alternativo. Tente de novo.', 'error');
    }
  }

  async function remove() {
    setDeleting(true);
    const res = await deleteContentAssetAction(asset.id);
    setDeleting(false);
    setConfirming(false);
    if (res.ok) {
      toast(res.data?.freedFile ? 'Excluído — o arquivo saiu do armazenamento.' : 'Excluído da biblioteca.', 'success');
      onDeleted();
    } else {
      toast(res.error ?? 'Não foi possível excluir. Tente de novo.', 'error');
    }
  }
  const video = asset.mimeType?.startsWith('video/');
  const size = asset.bytes
    ? asset.bytes < 1048576
      ? `${Math.max(1, Math.round(asset.bytes / 1024))} KB`
      : `${(asset.bytes / 1048576).toFixed(asset.bytes < 10 * 1048576 ? 1 : 0).replace('.', ',')} MB`
    : null;

  return (
    <div
      className={cn(
        'group relative aspect-video overflow-hidden rounded-lg transition-all',
        checked ? 'ring-2 ring-primary' : 'opacity-90 hover:opacity-100',
      )}
    >
      <button type="button" onClick={onSelect} className="block h-full w-full" title={asset.alt} aria-label={asset.alt}>
        <MediaThumb url={asset.url} alt={asset.alt} mimeType={asset.mimeType} durationMs={asset.durationMs} className="h-full w-full" />
      </button>
      {multiple && (
        <div
          className={cn(
            'pointer-events-none absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-on-media',
            checked ? 'bg-primary' : 'bg-scrim',
          )}
        >
          {checked && <Check className="h-3 w-3 text-primary-foreground" />}
        </div>
      )}
      {!editing && (
        // Com rato aparecem ao passar por cima; em ecrã de toque (sem hover) ficam sempre visíveis.
        <div className="absolute right-1 top-1 flex gap-1 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAlt(asset.alt);
              setEditing(true);
            }}
            title="Editar texto alternativo"
            aria-label="Editar texto alternativo"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-scrim-strong text-on-media hover:bg-scrim"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(true);
            }}
            disabled={deleting}
            title="Excluir"
            aria-label={video ? 'Excluir vídeo' : 'Excluir imagem'}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-scrim-strong text-on-media hover:bg-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {editing && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 flex flex-col justify-end gap-1 bg-scrim-strong p-1.5"
        >
          <input
            autoFocus
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') setEditing(false);
            }}
            aria-label="Texto alternativo"
            className="w-full rounded border-none bg-surface px-1.5 py-1 text-xs text-foreground outline-none focus-visible:ring-[1.5px] focus-visible:ring-[var(--ring-field)]"
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded px-1.5 py-0.5 text-xs text-on-media hover:bg-scrim"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded bg-surface px-1.5 py-0.5 text-xs font-medium text-foreground hover:bg-surface-2"
            >
              {saving ? '...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}
      {size && !editing && (
        <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-scrim px-1 text-xs tabular-nums text-on-media">{size}</span>
      )}
      <ConfirmDialog
        open={confirming}
        title={video ? 'Excluir vídeo' : 'Excluir imagem'}
        message={`"${asset.alt}" sai da biblioteca e o arquivo é apagado do armazenamento${size ? ` (libera ${size})` : ''}. Não dá para excluir o que estiver num artigo ou num post de rede social ainda por publicar; nos já publicados, a rede mantém a cópia dela.`}
        confirmLabel="Excluir"
        pending={deleting}
        onConfirm={remove}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
