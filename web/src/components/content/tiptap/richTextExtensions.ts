import StarterKit from '@tiptap/starter-kit';
import type { AnyExtension } from '@tiptap/core';

/**
 * Extensões da "prosa contínua" — espelha EXATAMENTE `RICH_TEXT_TAGS`
 * (modules/content/src/blocks.ts: p, h2/h3, ul/ol/li, blockquote, strong/em,
 * a, br) para que o que o autor edita nunca seja podado de surpresa pelo
 * sanitizador do servidor. Usada tanto pelo editor de verdade (combinada com
 * os nós atômicos em `PostBodyEditor`) quanto, sozinha, pela conversão
 * doc-Tiptap↔HTML de um bloco `richText` (`adapter.ts`) — os dois lados
 * precisam do MESMO schema, senão HTML gerado por um lado pode falhar ao
 * reabrir do outro.
 *
 * Sem `code`/`codeBlock`/`strike`/`underline`/`horizontalRule` (fora da
 * allow-list) — divisória e código têm seus próprios nós atômicos (`divider`,
 * `code`), e H1 nunca entra (o H1 da página é o título do post — mesmo
 * motivo do sanitizador).
 */
export function richTextExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      strike: false,
      underline: false,
      horizontalRule: false,
      heading: { levels: [2, 3, 4] },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        protocols: ['http', 'https', 'mailto'],
      },
    }) as unknown as AnyExtension,
  ];
}
