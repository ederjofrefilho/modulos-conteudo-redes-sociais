import type { useRouter } from 'next/navigation';

type Router = ReturnType<typeof useRouter>;

/**
 * Navega com a View Transitions API nativa do navegador (sem suporte em
 * Firefox/Safari — cai de volta pra um router.push comum, progressive
 * enhancement puro). Existe pra dar a sensação de "uma superfície contínua"
 * descrita no plano de design: o elemento com o mesmo `view-transition-name`
 * na lista e no detalhe (ver Avatar `style` em contacts/accounts) morfa em
 * vez de cortar a tela.
 *
 * App Router não expõe um evento de "navegação concluída", então o
 * callback resolve depois de 2 frames — suficiente pra a maioria das
 * navegações locais; se o fetch da rota destino demorar mais que isso, o
 * pior caso é a transição capturar um quadro cedo demais (nunca quebra a
 * navegação em si, só o efeito visual fica menos perfeito).
 *
 * NUNCA usar isto como base pra uma animação que precisa estar SEMPRE
 * visível: um teste isolado (`document.startViewTransition` com um callback
 * trivial, sem nada de Next.js envolvido) mostrou `.ready` rejeitando com
 * `InvalidStateError: Transition was aborted because of invalid state` de
 * forma inconsistente — a "sensação de continuidade" aqui é só um extra
 * (progressive enhancement de verdade: se abortar, o navegador já trocou de
 * página do mesmo jeito, só sem o crossfade). Foi por isso que o "carrossel"
 * entre seções principais foi refeito sem depender desta função — ver
 * `components/PageTransitionWrapper.tsx`.
 */
interface NativeViewTransition {
  ready: Promise<void>;
  finished: Promise<void>;
}

type DocumentWithViewTransitions = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => NativeViewTransition;
};

// Só uma transição pode estar ativa por vez (spec) — chamar de novo enquanto
// a anterior ainda não assentou é exatamente o que dispara InvalidStateError.
// Clique duplo/impaciente cai pro router.push direto em vez de empilhar.
let inFlight: Promise<void> | null = null;

export function navigateWithViewTransition(router: Router, href: string): void {
  const doc = document as DocumentWithViewTransitions;
  if (
    !doc.startViewTransition ||
    inFlight ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    router.push(href);
    return;
  }
  try {
    const transition = doc.startViewTransition(() => {
      return new Promise<void>((resolve) => {
        router.push(href);
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    });
    // .ready E .finished rejeitam se o navegador abortar a transição (troca
    // de tema no meio do caminho, nova navegação antes desta assentar) — são
    // promises INDEPENDENTES, então as duas precisam de catch, senão a que
    // ficar sem handler vira exceção não tratada no console mesmo com a
    // navegação já tendo funcionado normalmente.
    transition.ready.catch(() => {});
    inFlight = transition.finished.catch(() => {}).finally(() => {
      inFlight = null;
    });
  } catch {
    // startViewTransition pode lançar sincronamente em vez de rejeitar (ex.:
    // chamado nesse exato instante em que o navegador ainda está encerrando
    // a transição anterior) — a navegação já foi disparada por router.push
    // dentro do callback, então só engolimos o erro da transição em si.
  }
}

/** Intercepta um clique simples (sem modificadoras) num <Link> pra usar a transição; ctrl/cmd/meio-clique seguem o padrão do navegador (abrir em nova aba). */
export function onLinkClickWithTransition(
  e: React.MouseEvent<HTMLAnchorElement>,
  router: Router,
  href: string,
): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigateWithViewTransition(router, href);
}
