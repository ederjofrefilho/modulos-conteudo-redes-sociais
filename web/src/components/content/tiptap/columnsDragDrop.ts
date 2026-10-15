import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Node as PMNode, type Schema } from '@tiptap/pm/model';
import { Transform } from '@tiptap/pm/transform';
import type { EditorView } from '@tiptap/pm/view';

/**
 * Arraste estilo Notion: soltar um bloco perto da borda esquerda/direita de
 * outro bloco cria (ou estende) um layout de colunas; soltar o ÚLTIMO bloco
 * de uma coluna em outro lugar remove a coluna e, se sobrar só uma, desfaz o
 * layout inteiro. Tudo puro/testável (`applyColumnDrop`) por baixo do plugin
 * do ProseMirror que só traduz coordenadas de mouse pra posições de documento
 * (`columnsDragDropPlugin`).
 *
 * Deliberadamente FORA de escopo (ver BACKLOG): reordenar arrastando um bloco
 * de uma coluna pra outra DENTRO do mesmo `columns` (cai no reordenamento
 * vertical padrão do ProseMirror); mover `accordion`/`columns` inteiros pra
 * dentro de uma coluna (schema já proíbe, `LEAF_CONTENT_EXPR` não inclui
 * contêiner).
 */

export type DropSide = 'left' | 'right';

export type ColumnDropTarget =
  | { kind: 'wrap'; blockPos: number; side: DropSide }
  | { kind: 'add-column'; columnsPos: number; columnIndex: number; side: DropSide };

type JSONNode = { type: string; attrs?: Record<string, unknown>; content?: JSONNode[] };

/** Distribui `total` em `parts` inteiros o mais igual possível (ex.: 12/4 -> [3,3,3,3], 12/3 -> [4,4,4]). */
export function evenSplit(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

interface SourceLocation {
  sourceNode: PMNode;
  /** Posição do bloco de nível superior que precisa ser reescrito pra remover a origem — o próprio bloco (se já era de topo) ou o `columns` que o contém. */
  topPos: number;
  topNode: PMNode;
  inColumn: { columnsNode: PMNode; columnIndex: number; blockIndexInColumn: number } | null;
}

function locateSource(doc: PMNode, sourcePos: number): SourceLocation | null {
  const $pos = doc.resolve(sourcePos);
  const sourceNode = $pos.nodeAfter;
  if (!sourceNode) return null;

  if ($pos.depth === 0) {
    return { sourceNode, topPos: sourcePos, topNode: sourceNode, inColumn: null };
  }
  if ($pos.depth === 2 && $pos.node(1).type.name === 'columns' && $pos.node(2).type.name === 'column') {
    return {
      sourceNode,
      topPos: $pos.before(1),
      topNode: $pos.node(1),
      inColumn: { columnsNode: $pos.node(1), columnIndex: $pos.index(1), blockIndexInColumn: $pos.index(2) },
    };
  }
  return null; // dentro de accordion, lista, etc. — fora de escopo, cai no comportamento padrão
}

/** JSON do bloco de nível superior DEPOIS de remover a origem — array vazio = remove o slot inteiro. */
function buildRemovalReplacement(loc: SourceLocation): JSONNode[] {
  if (!loc.inColumn) return [];

  const { columnsNode, columnIndex, blockIndexInColumn } = loc.inColumn;
  const columnsJSON = columnsNode.toJSON() as JSONNode;
  const columns = (columnsJSON.content ?? []) as JSONNode[];
  const targetColumn = columns[columnIndex]!;
  const remainingBlocks = (targetColumn.content ?? []).filter((_, i) => i !== blockIndexInColumn);

  let nextColumns: JSONNode[];
  if (remainingBlocks.length === 0) {
    // Coluna ficou vazia — remove a coluna inteira, não só o bloco (schema exige `column.content: +`, nunca vazio).
    nextColumns = columns.filter((_, i) => i !== columnIndex);
  } else {
    nextColumns = columns.map((c, i) => (i === columnIndex ? { ...c, content: remainingBlocks } : c));
  }

  if (nextColumns.length <= 1) {
    // Só sobrou (no máximo) uma coluna — desfaz o layout, devolve o conteúdo dela direto no nível superior.
    return nextColumns.length === 1 ? (nextColumns[0]!.content ?? []) : [];
  }
  const spans = evenSplit(12, nextColumns.length);
  return [{ ...columnsJSON, content: nextColumns.map((c, i) => ({ ...c, attrs: { ...c.attrs, span: spans[i] } })) }];
}

/** Reescreve UM slot de nível superior (`pos`, tamanho `size`) com o array de nós dado (vazio = remove o slot). */
function replaceTopLevelSlot(tr: Transform, pos: number, size: number, schema: Schema, replacement: JSONNode[]) {
  const mappedFrom = tr.mapping.map(pos);
  const mappedTo = tr.mapping.map(pos + size);
  if (replacement.length === 0) {
    tr.delete(mappedFrom, mappedTo);
    return;
  }
  const nodes = replacement.map((json) => PMNode.fromJSON(schema, json));
  tr.replaceWith(mappedFrom, mappedTo, nodes);
}

/**
 * Núcleo puro — recebe o doc ANTES do drop, a posição de origem e o alvo já
 * resolvido (`ColumnDropTarget`, calculado pelo plugin a partir das
 * coordenadas do mouse), devolve o doc NOVO ou `null` se a operação não faz
 * sentido (mesma posição, origem é um contêiner, limite de 4 colunas etc.) —
 * `null` sinaliza "deixa o comportamento padrão do ProseMirror agir".
 */
export function applyColumnDrop(schema: Schema, doc: PMNode, sourcePos: number, target: ColumnDropTarget): PMNode | null {
  const loc = locateSource(doc, sourcePos);
  if (!loc) return null;
  if (loc.sourceNode.type.name === 'columns' || loc.sourceNode.type.name === 'accordion') return null; // nunca aninha contêiner

  if (target.kind === 'wrap') {
    if (target.blockPos === loc.topPos) return null; // soltou em cima de si mesmo (ou do próprio columns que o contém)
    const targetNode = doc.nodeAt(target.blockPos);
    if (!targetNode) return null;
    if (targetNode.type.name === 'columns' || targetNode.type.name === 'accordion') return null; // alvo não pode virar conteúdo de coluna

    const targetJSON = targetNode.toJSON() as JSONNode;
    const sourceJSON = loc.sourceNode.toJSON() as JSONNode;
    const columnsBlock: JSONNode = {
      type: 'columns',
      attrs: { width: 'content', stackBelow: 'md' },
      content:
        target.side === 'left'
          ? [
              { type: 'column', attrs: { span: 6 }, content: [sourceJSON] },
              { type: 'column', attrs: { span: 6 }, content: [targetJSON] },
            ]
          : [
              { type: 'column', attrs: { span: 6 }, content: [targetJSON] },
              { type: 'column', attrs: { span: 6 }, content: [sourceJSON] },
            ],
    };

    const removal = buildRemovalReplacement(loc);
    const tr = new Transform(doc);
    // Duas reescritas de slots de nível superior DISTINTOS (origem e alvo nunca
    // coincidem, já checado acima) — pela posição original menor primeiro, a
    // segunda usa `tr.mapping` pra achar sua posição depois da primeira.
    const ops = [
      { pos: loc.topPos, size: loc.topNode.nodeSize, replacement: removal },
      { pos: target.blockPos, size: targetNode.nodeSize, replacement: [columnsBlock] },
    ].sort((a, b) => a.pos - b.pos);
    for (const op of ops) replaceTopLevelSlot(tr, op.pos, op.size, schema, op.replacement);
    return tr.doc;
  }

  // target.kind === 'add-column'
  if (target.columnsPos === loc.topPos) return null; // mesma `columns` de origem — fora de escopo (vira reorder padrão)
  const columnsNode = doc.nodeAt(target.columnsPos);
  if (!columnsNode || columnsNode.type.name !== 'columns') return null;
  if (columnsNode.childCount >= 4) return null; // já no teto

  const columnsJSON = columnsNode.toJSON() as JSONNode;
  const existing = (columnsJSON.content ?? []) as JSONNode[];
  const insertAt = target.side === 'left' ? target.columnIndex : target.columnIndex + 1;
  const withNewColumn = [...existing];
  withNewColumn.splice(insertAt, 0, { type: 'column', attrs: { span: 6 }, content: [loc.sourceNode.toJSON() as JSONNode] });
  const spans = evenSplit(12, withNewColumn.length);
  const newColumnsBlock: JSONNode = { ...columnsJSON, content: withNewColumn.map((c, i) => ({ ...c, attrs: { ...c.attrs, span: spans[i] } })) };

  const removal = buildRemovalReplacement(loc);
  const tr = new Transform(doc);
  const ops = [
    { pos: loc.topPos, size: loc.topNode.nodeSize, replacement: removal },
    { pos: target.columnsPos, size: columnsNode.nodeSize, replacement: [newColumnsBlock] },
  ].sort((a, b) => a.pos - b.pos);
  for (const op of ops) replaceTopLevelSlot(tr, op.pos, op.size, schema, op.replacement);
  return tr.doc;
}

// --- Integração com o editor (coordenadas de mouse -> ColumnDropTarget) ----

const EDGE_RATIO = 0.25; // 25% mais próximo de cada borda conta como "zona de coluna"
const columnsDragDropKey = new PluginKey('columnsDragDrop');

/** A partir de uma posição de documento + coordenada X do mouse, decide se é uma "zona de borda" e, se for, monta o `ColumnDropTarget`. */
function resolveDropTarget(view: EditorView, pos: number, clientX: number): ColumnDropTarget | null {
  const $pos = view.state.doc.resolve(pos);

  // Dentro de uma coluna existente? Mede contra o retângulo da COLUNA (não do
  // bloco individual) — a zona de borda ali significa "nova coluna ao lado
  // desta", não "empilhar dentro do mesmo bloco".
  for (let d = $pos.depth; d >= 1; d--) {
    if ($pos.node(d).type.name === 'column' && d >= 1 && $pos.node(d - 1)?.type.name === 'columns') {
      const columnPos = $pos.before(d);
      const dom = view.nodeDOM(columnPos) as HTMLElement | null;
      if (!dom?.getBoundingClientRect) return null;
      const rect = dom.getBoundingClientRect();
      const side = sideFromRect(rect, clientX);
      if (!side) return null;
      return { kind: 'add-column', columnsPos: $pos.before(d - 1), columnIndex: $pos.index(d - 1), side };
    }
  }

  // Bloco de nível superior comum.
  if ($pos.depth < 1) return null;
  const blockPos = $pos.before(1);
  const dom = view.nodeDOM(blockPos) as HTMLElement | null;
  if (!dom?.getBoundingClientRect) return null;
  const rect = dom.getBoundingClientRect();
  const side = sideFromRect(rect, clientX);
  if (!side) return null;
  return { kind: 'wrap', blockPos, side };
}

function sideFromRect(rect: DOMRect, clientX: number): DropSide | null {
  const edge = rect.width * EDGE_RATIO;
  if (clientX <= rect.left + edge) return 'left';
  if (clientX >= rect.right - edge) return 'right';
  return null;
}

/** Mesma indicação visual em qualquer navegador: uma barra fina absoluta no lado detectado, marcada via classe CSS no elemento sob o cursor (`.column-drop-left`/`.column-drop-right`, ver globals.css). */
function clearIndicator(view: EditorView) {
  view.dom.querySelectorAll('.column-drop-left, .column-drop-right').forEach((el) => {
    el.classList.remove('column-drop-left', 'column-drop-right');
  });
}

export const ColumnsDragDrop = Extension.create({
  name: 'columnsDragDrop',

  addProseMirrorPlugins() {
    // Último alvo válido visto durante o `dragover` — cache por instância do
    // plugin (uma por editor). Ver o comentário grande em `drop` abaixo pra
    // entender por que isso é necessário e não só uma otimização.
    let lastTarget: ColumnDropTarget | null = null;

    return [
      new Plugin({
        key: columnsDragDropKey,
        props: {
          handleDOMEvents: {
            dragover(view, event) {
              // `view.dragging` só existe durante um arraste iniciado pelo
              // nosso próprio `<DragHandle>` (ver PostBodyEditor.tsx) — um
              // arraste de arquivo/texto externo não passa por aqui.
              if (!view.dragging) return false;
              const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
              clearIndicator(view);
              if (!coords) {
                lastTarget = null;
                return false;
              }
              const target = resolveDropTarget(view, coords.pos, event.clientX);
              lastTarget = target;
              if (!target) return false;
              const anchorPos = target.kind === 'wrap' ? target.blockPos : target.columnsPos;
              const dom = view.nodeDOM(anchorPos) as HTMLElement | null;
              dom?.classList.add(target.side === 'left' ? 'column-drop-left' : 'column-drop-right');
              return false; // não consome o evento — só decora; `drop` decide de verdade
            },
            dragleave(view, event) {
              // Só limpa quando o cursor sai de vez do editor (não a cada
              // pixel entre elementos filhos, que dispara dragleave/dragenter
              // sem sair da área real).
              if (event.relatedTarget && view.dom.contains(event.relatedTarget as Node)) return false;
              clearIndicator(view);
              lastTarget = null;
              return false;
            },
            /**
             * A lógica de verdade mora AQUI, em `handleDOMEvents.drop`, e não
             * no prop `handleDrop` do EditorProps (onde estava antes) —
             * verificado ao vivo (harness isolado fora do CRM, sem precisar
             * do Postgres local): o `dragover` resolve o alvo corretamente
             * ({kind:"wrap", side:"right", ...}), mas o `handleDrop` do
             * EditorProps NUNCA chega a disparar. Motivo, em
             * prosemirror-view/dist/index.js: a função interna que o
             * ProseMirror chama no `drop` nativo faz
             * `let eventPos = view.posAtCoords(eventCoords(event)); if
             * (!eventPos) return;` ANTES de invocar
             * `view.someProp("handleDrop", ...)` — se as coordenadas exatas
             * do evento `drop` (que podem diferir sutilmente das do último
             * `dragover`, sobretudo bem na borda/fora do texto visível, que é
             * exatamente o caso de arrastar "para o lado") não resolverem
             * uma posição, o ProseMirror desiste ANTES de perguntar aos
             * plugins — nosso `handleDrop` nunca era chamado.
             *
             * `handleDOMEvents.drop`, por outro lado, roda em
             * `runCustomHandler`, ANTES desse código interno (`dispatchEvent`
             * só chama o handler nativo `editHandlers.drop` se nenhum plugin
             * já tiver consumido o evento) — então dá pra agir mesmo quando
             * as coordenadas do `drop` em si são inúteis, usando o ÚLTIMO
             * alvo válido que o `dragover` já tinha resolvido e mostrado como
             * indicador visual (`lastTarget`) como fonte da verdade, com uma
             * tentativa de recálculo ao vivo primeiro (mais preciso quando
             * funciona).
             */
            drop(view, event) {
              clearIndicator(view);
              if (!view.dragging) return false;

              // NÃO usar `view.dragging.node`: o `@tiptap/extension-drag-handle`
              // só o preenche quando `nestedOptions.enabled && dragContext.node`
              // (arraste iniciado DE DENTRO de um contêiner aninhado) — no caso
              // comum, um bloco de nível superior arrastado pela alça global,
              // ele cria uma `NodeRangeSelection` (não uma `NodeSelection`) e
              // deixa `node: undefined` (dist/index.js daquele pacote). Em vez
              // disso, lemos a seleção que o próprio drag handle já aplicou via
              // `tr.setSelection(...)` antes de despachar o arraste — presente
              // em ambos os casos — e confirmamos que ela cobre EXATAMENTE um
              // bloco (não um intervalo de vários, fora de escopo aqui).
              const sel = view.state.selection;
              const draggedNode = sel.$from.nodeAfter;
              if (!draggedNode || sel.to - sel.from !== draggedNode.nodeSize) {
                lastTarget = null;
                return false;
              }
              const sourcePos = sel.from;

              const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
              const liveTarget = coords ? resolveDropTarget(view, coords.pos, event.clientX) : null;
              const target = liveTarget ?? lastTarget;
              lastTarget = null;
              if (!target) return false;

              const nextDoc = applyColumnDrop(view.state.schema, view.state.doc, sourcePos, target);
              if (!nextDoc) return false;

              event.preventDefault();
              // Substitui o documento inteiro por `nextDoc` (já calculado por
              // `applyColumnDrop`, puro) — `view.dispatch` já passa pelo
              // `dispatchTransaction` que o Tiptap registra na criação do
              // editor, então o `onUpdate`/autosave disparam sozinhos, sem
              // precisar emitir nada manualmente aqui. Retornar `true` aqui
              // impede o `editHandlers.drop` interno do ProseMirror de rodar
              // em seguida (ver comentário acima) — sem isso, ele tentaria
              // fazer SEU PRÓPRIO insert/reorder por cima do que acabamos de
              // aplicar.
              const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, nextDoc.content);
              view.dispatch(tr);
              return true;
            },
          },
        },
      }),
    ];
  },
});
