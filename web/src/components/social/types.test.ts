import { describe, expect, it } from 'vitest';
import { asItems, type WorkspacePost } from './types';

const post = (id: string, campaignKey: string | null) => ({ id, campaignKey, account: { provider: 'LINKEDIN' } }) as unknown as WorkspacePost;

describe('cada post é independente', () => {
  it('um item por post, mesmo com a mesma campanha', () => {
    const items = asItems([post('li', 'c1'), post('ig', 'c1')]);
    expect(items.map((i) => i.id)).toEqual(['li', 'ig']);
    expect(items.every((i) => i.variants.length === 1)).toBe(true);
  });
});
