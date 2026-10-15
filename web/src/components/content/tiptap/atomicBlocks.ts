import type { LeafBlock, LeafBlockType } from '@app/content-contract';

/** Nomes dos nós Tiptap == `LeafBlock['type']` de propósito — mapeia attrs sem indireção. `richText` nunca vira nó atômico (é prosa contínua), por isso fica de fora. */
export const ATOMIC_LEAF_TYPES = [
  'image',
  'callout',
  'stat',
  'embed',
  'divider',
  'gallery',
  'table',
  'button',
  'code',
  'quote',
  'toc',
] as const satisfies readonly Exclude<LeafBlockType, 'richText'>[];
export type AtomicLeafType = (typeof ATOMIC_LEAF_TYPES)[number];

export function isAtomicLeafType(type: string): type is AtomicLeafType {
  return (ATOMIC_LEAF_TYPES as readonly string[]).includes(type);
}

export function leafBlockToNodeAttrs(block: LeafBlock): Record<string, unknown> {
  switch (block.type) {
    case 'richText':
      return {};
    case 'image':
      return { assetId: block.assetId || null, caption: block.caption ?? null, width: block.width };
    case 'callout':
      return {
        variant: block.variant,
        title: block.title ?? null,
        text: block.text,
        ctaLabel: block.ctaLabel ?? null,
        ctaHref: block.ctaHref ?? null,
      };
    case 'stat':
      return { value: block.value, label: block.label };
    case 'embed':
      return { url: block.url, caption: block.caption ?? null, provider: block.provider ?? null, ratio: block.ratio ?? null };
    case 'divider':
      return {};
    case 'gallery':
      return {
        assetIds: block.assetIds,
        layout: block.layout,
        columns: block.columns,
        caption: block.caption ?? null,
        width: block.width,
      };
    case 'table':
      return { head: block.head, rows: block.rows, width: block.width };
    case 'button':
      return { label: block.label, href: block.href, variant: block.variant, align: block.align };
    case 'code':
      return { language: block.language, code: block.code };
    case 'quote':
      return { text: block.text, attribution: block.attribution ?? null };
    case 'toc':
      return {};
  }
}

export function nodeAttrsToLeafBlock(type: AtomicLeafType, attrs: Record<string, any>): LeafBlock {
  switch (type) {
    case 'image':
      return { type, assetId: attrs.assetId ?? '', caption: attrs.caption || undefined, width: attrs.width ?? 'content' };
    case 'callout':
      return {
        type,
        variant: attrs.variant ?? 'info',
        title: attrs.title || undefined,
        text: attrs.text ?? '',
        ctaLabel: attrs.ctaLabel || undefined,
        ctaHref: attrs.ctaHref || undefined,
      };
    case 'stat':
      return { type, value: attrs.value ?? '', label: attrs.label ?? '' };
    case 'embed':
      return {
        type,
        url: attrs.url ?? '',
        caption: attrs.caption || undefined,
        provider: attrs.provider || undefined,
        ratio: attrs.ratio || undefined,
      };
    case 'divider':
      return { type };
    case 'gallery':
      return {
        type,
        assetIds: attrs.assetIds ?? [],
        layout: attrs.layout ?? 'grid',
        columns: attrs.columns ?? 3,
        caption: attrs.caption || undefined,
        width: attrs.width ?? 'content',
      };
    case 'table':
      return { type, head: attrs.head ?? true, rows: attrs.rows ?? [], width: attrs.width ?? 'content' };
    case 'button':
      return { type, label: attrs.label ?? '', href: attrs.href ?? '', variant: attrs.variant ?? 'primary', align: attrs.align ?? 'left' };
    case 'code':
      return { type, language: attrs.language ?? '', code: attrs.code ?? '' };
    case 'quote':
      return { type, text: attrs.text ?? '', attribution: attrs.attribution || undefined };
    case 'toc':
      return { type };
  }
}
