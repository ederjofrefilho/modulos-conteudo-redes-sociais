'use client';

import { useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { Search, Upload as UploadIcon } from 'lucide-react';
import { Button, Dialog, Field, Input, useToast } from '@/components/ui';
import { ASSET_MIME_TYPES, isVideoMime } from '@app/content/media';
import { MediaPickerItem } from './MediaPickerItem';
import { readImageSize, readVideoInfo } from './media-files';
import {
  listContentAssetsAction,
  createContentAssetAction,
  contentStorageAction,
} from '@/app/(app)/conteudo/actions';

export interface PickedAsset {
  id: string;
  url: string;
  width: number;
  height: number;
  alt: string;
  mimeType?: string;
  durationMs?: number | null;
  bytes?: number;
}

const PAGE_SIZE = 24;

/**
 * Upload direto para o Blob (`upload()` de `@vercel/blob/client`, token
 * emitido por `/api/content/assets/upload`) — o arquivo nunca passa pelo
 * corpo de uma Server Action. `alt` é exigido ANTES de abrir o seletor de
 * arquivo: é requisito de publicação (`publishPost`), e pedir depois de
 * enviada significa nunca pedir.
 *
 * Dois modos, mesmo diálogo: seleção única (`onSelect`, imagem/capa — clicar
 * já seleciona e fecha, como sempre) e seleção múltipla (`onSelectMultiple`,
 * galeria — clicar alterna um check, "Confirmar" no rodapé aplica).
 *
 * `allowVideo` (redes sociais) mostra e aceita vídeo MP4 também; sem ele,
 * só imagens (blog e modelos, que não têm onde pôr vídeo).
 */
export function MediaPicker({
  open,
  onClose,
  onSelect,
  onSelectMultiple,
  initialSelectedIds,
  allowVideo = false,
  minSelected = 2,
}: {
  open: boolean;
  onClose: () => void;
  onSelect?: (asset: PickedAsset) => void;
  onSelectMultiple?: (assets: PickedAsset[]) => void;
  initialSelectedIds?: string[];
  allowVideo?: boolean;
  /** Mínimo para "Confirmar" na seleção múltipla: galeria pede 2, post de rede 1. */
  minSelected?: number;
}) {
  const multiple = !!onSelectMultiple;
  const [items, setItems] = useState<PickedAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [alt, setAlt] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [storage, setStorage] = useState<{ files: number; bytes: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setSelectedIds(initialSelectedIds ?? []);
    setQ('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const handle = setTimeout(() => {
      listContentAssetsAction(q, PAGE_SIZE, allowVideo ? undefined : 'image')
        .then((res) => {
          setItems(res.items as PickedAsset[]);
          setTotal(res.total);
        })
        .then(() => contentStorageAction().then(setStorage, () => null))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [open, q]);

  function pickFile() {
    if (!alt.trim()) {
      toast(`Descreva ${allowVideo ? 'o arquivo' : 'a imagem'} (texto alternativo) antes de escolher o arquivo.`, 'error');
      return;
    }
    fileRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    try {
      const video = isVideoMime(file.type);
      if (video && !allowVideo) throw new Error('Aqui só entram imagens.');
      if (!(ASSET_MIME_TYPES as readonly string[]).includes(file.type)) {
        throw new Error(
          video
            ? 'Vídeo em formato não aceito: use MP4 (ou MOV, só para o Instagram).'
            : 'Imagem em formato não aceito: use JPG, PNG, WebP ou GIF.',
        );
      }
      const { width, height, durationMs } = video ? await readVideoInfo(file) : { ...(await readImageSize(file)), durationMs: null };
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/content/assets/upload',
      });
      const res = await createContentAssetAction({
        url: blob.url,
        pathname: blob.pathname,
        width,
        height,
        alt: alt.trim(),
        bytes: file.size,
        mimeType: file.type,
        durationMs,
      });
      if (!res.ok || !res.data) {
        toast(res.error ?? 'Não foi possível registrar a imagem. Tente de novo.', 'error');
        return;
      }
      const asset: PickedAsset = { id: res.data.id, url: blob.url, width, height, alt: alt.trim(), mimeType: file.type, durationMs, bytes: file.size };
      setItems((prev) => [asset, ...prev]);
      setAlt('');
      if (multiple) {
        setSelectedIds((prev) => [...prev, asset.id]);
      } else {
        onSelect?.(asset);
        onClose();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha no upload.', 'error');
    } finally {
      setUploading(false);
    }
  }

  function toggle(asset: PickedAsset) {
    setSelectedIds((prev) => (prev.includes(asset.id) ? prev.filter((id) => id !== asset.id) : [...prev, asset.id]));
  }

  function confirmMultiple() {
    // Limitação conhecida: só resolve pra `PickedAsset` os ids que ainda
    // estão na página/busca atual — trocar a busca depois de selecionar em
    // outra página pode perder a seleção anterior da lista final (o check
    // continua marcado visualmente, mas o item some de `items`). Aceitável
    // pelo tamanho típico de uma galeria (poucas dezenas de imagens); uma
    // busca melhor exigiria manter os `PickedAsset` completos selecionados
    // num Map à parte, não só os ids.
    onSelectMultiple?.(items.filter((it) => selectedIds.includes(it.id)));
    onClose();
  }

  return (
    <Dialog open={open} title={allowVideo ? 'Escolher imagens ou vídeo' : multiple ? 'Escolher imagens' : 'Escolher imagem'} onClose={onClose} size="lg">
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-2 rounded-lg bg-surface-2 p-3">
          <Field
            label={allowVideo ? 'Texto alternativo do novo arquivo' : 'Texto alternativo da nova imagem'}
            hint={
              allowVideo
                ? 'Obrigatório. No telemóvel, "Enviar" abre a galeria. Vídeo: MP4 (ou MOV, só Instagram) até 200 MB — 16:9 para LinkedIn, 9:16 para Reels e Stories.'
                : 'Obrigatório — é o que garante acessibilidade e é exigido para publicar.'
            }
          >
            <Input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder={allowVideo ? 'Ex.: anúncio de 24 s, três planilhas viram uma resposta' : 'Ex.: gráfico de lineage do dbt'} />
          </Field>
          <Button type="button" size="sm" onClick={pickFile} loading={uploading}>
            <UploadIcon className="h-3.5 w-3.5" /> Enviar
          </Button>
          <input
            ref={fileRef}
            type="file"
            // Genérico de propósito: com tipos exatos o telemóvel abre o gestor de arquivos;
            // com image/* e video/* oferece a galeria (Fototeca no iPhone) e a câmara.
            // O tipo é conferido em handleFile (o Safari já converte HEIC para JPEG).
            accept={allowVideo ? 'image/*,video/*' : 'image/*'}
            hidden
            onChange={handleFile}
          />
        </div>

        {storage && (
          <p className="-mb-2 text-xs text-muted">
            Biblioteca: {storage.files} arquivo(s) · {(storage.bytes / 1048576).toFixed(0)} MB. Exclua (lixeira em cada arquivo) o que já não usa
            para libertar espaço.
          </p>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por alt ou nome do arquivo..." className="pl-8" />
        </div>

        {loading ? (
          <p className="text-sm text-muted">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">{q ? 'Nada encontrado.' : allowVideo ? 'Nenhum arquivo enviado ainda.' : 'Nenhuma imagem enviada ainda.'}</p>
        ) : (
          <>
            <div className="grid max-h-96 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
              {items.map((a) => (
                <MediaPickerItem
                  key={a.id}
                  asset={a}
                  multiple={multiple}
                  checked={selectedIds.includes(a.id)}
                  onSelect={() => {
                    if (multiple) {
                      toggle(a);
                    } else {
                      onSelect?.(a);
                      onClose();
                    }
                  }}
                  onAltSaved={(alt) => setItems((prev) => prev.map((it) => (it.id === a.id ? { ...it, alt } : it)))}
                  onDeleted={() => {
                    setItems((prev) => prev.filter((it) => it.id !== a.id));
                    setSelectedIds((prev) => prev.filter((id) => id !== a.id));
                  }}
                />
              ))}
            </div>
            {total > items.length && <p className="text-center text-xs text-muted">Mostrando {items.length} de {total} — refine a busca para ver mais.</p>}
          </>
        )}

        {multiple && (
          <div className="flex items-center justify-between pt-3">
            <span className="text-sm text-muted">{selectedIds.length} selecionada(s)</span>
            <Button type="button" size="sm" onClick={confirmMultiple} disabled={selectedIds.length < minSelected}>
              Confirmar
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
