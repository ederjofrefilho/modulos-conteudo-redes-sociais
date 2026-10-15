import type { ContentKind } from '@app/db';

/**
 * Avisa o site (site institucional) que um post mudou, para ele revalidar só aquela
 * rota via ISR sob demanda em vez de esperar o próximo build. Mesma
 * degradação graciosa de `createLead`/`createLeadIntent` no site
 * (`site/src/lib/crm.ts`): sem as duas variáveis, pula com aviso;
 * falhando, loga e segue — nunca lança. Publicar/despublicar não pode
 * depender do site estar no ar.
 *
 * Não é "dispara e esquece" solto (`fetch` sem `await`): numa function
 * serverless o processo pode encerrar antes do fetch terminar. Aguarda a
 * chamada, só nunca deixa uma falha dela virar erro pra quem chamou.
 */
export async function notifySiteRevalidate(kind: ContentKind, slug: string): Promise<void> {
  const url = process.env.SITE_REVALIDATE_URL;
  const secret = process.env.SITE_REVALIDATE_SECRET;
  if (!url || !secret) {
    console.warn('[content] SITE_REVALIDATE_URL/SITE_REVALIDATE_SECRET ausentes — site não foi avisado.');
    return;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ kind, slug }),
    });
    if (!res.ok) {
      console.error(`[content] webhook de revalidação do site respondeu ${res.status}: ${await res.text()}`);
    }
  } catch (error) {
    console.error('[content] Falha ao chamar o webhook de revalidação do site:', error);
  }
}
