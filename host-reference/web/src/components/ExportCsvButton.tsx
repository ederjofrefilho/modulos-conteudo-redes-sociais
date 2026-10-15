'use client';

import { useTransition } from 'react';
import { Download } from 'lucide-react';
import { Button, useToast } from '@/components/ui';

/**
 * Baixa o CSV gerado por uma Server Action (mesmos filtros da tela — busca/
 * "minhas"/etc, passados em `params`) como arquivo local. BOM UTF-8 na
 * frente do conteúdo é o que faz o Excel em pt-BR abrir acentos certos sem
 * o usuário precisar escolher a codificação na importação.
 */
export function ExportCsvButton<P extends Record<string, unknown>>({
  filename,
  params,
  action,
  asMenuItem = false,
}: {
  filename: string;
  params: P;
  action: (params: P) => Promise<string>;
  /** Dentro de um `<MenuItem>` (menu "Mais ações" da linha de ferramentas). */
  asMenuItem?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function download() {
    startTransition(async () => {
      try {
        const csv = await action(params);
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      } catch {
        toast('Falha ao exportar CSV.', 'error');
      }
    });
  }

  if (asMenuItem) {
    return (
      <button type="button" onClick={download}>
        <Download className="h-3.5 w-3.5" /> Exportar CSV
      </button>
    );
  }

  return (
    <Button variant="secondary" size="sm" onClick={download} loading={pending}>
      <Download className="h-4 w-4" /> Exportar CSV
    </Button>
  );
}
