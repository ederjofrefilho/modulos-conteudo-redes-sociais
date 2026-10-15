'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, FileText, Newspaper, Plus } from 'lucide-react';
import { Button, Menu, MenuItem, useToast } from '@/components/ui';
import { quickCreatePostAction } from '@/app/(app)/conteudo/actions';

/**
 * Criação instantânea — sem tela-ponte. Escolher o tipo já cria o rascunho
 * ("Sem título", tudo mais vazio/editável a seguir) e navega direto para o
 * editor completo. Substitui a antiga `/conteudo/novo` (Tipo+Título+
 * Categoria antes de começar a escrever de verdade).
 */
export function NewPostMenu() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function create(kind: 'ARTICLE' | 'CASE') {
    startTransition(async () => {
      const res = await quickCreatePostAction(kind);
      if (res.ok && res.data) {
        router.push(`/conteudo/${res.data.id}`);
      } else {
        toast(res.error ?? 'Não foi possível criar o post. Tente de novo.', 'error');
      }
    });
  }

  return (
    <Menu
      trigger={() => (
        <Button size="sm" disabled={pending}>
          <Plus className="h-3.5 w-3.5" /> Novo post <ChevronDown className="h-3 w-3" />
        </Button>
      )}
      triggerClassName="rounded-full"
    >
      <MenuItem>
        <button type="button" onClick={() => create('ARTICLE')}>
          <Newspaper className="h-3.5 w-3.5" /> Novo artigo
        </button>
      </MenuItem>
      <MenuItem>
        <button type="button" onClick={() => create('CASE')}>
          <FileText className="h-3.5 w-3.5" /> Novo caso de sucesso
        </button>
      </MenuItem>
    </Menu>
  );
}
