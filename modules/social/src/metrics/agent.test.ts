import { describe, expect, it } from 'vitest';
import { metricsAvailability } from './agent.js';
import { listInstagramMedia, listLinkedinOrganizationPosts } from './import.js';

const base = { isActive: true, hasToken: true };

describe('disponibilidade de métricas por conta', () => {
  it('perfil pessoal do LinkedIn: indisponível, com o texto explícito', () => {
    const r = metricsAvailability({ ...base, provider: 'LINKEDIN', kind: 'PERSON', scopes: ['openid', 'profile', 'w_member_social'] });
    expect(r.availability).toBe('unavailable');
    expect(r.message).toMatch(/^Métricas indisponíveis para perfil pessoal/);
  });

  it('Página do LinkedIn com r_organization_social: completa', () => {
    expect(metricsAvailability({ ...base, provider: 'LINKEDIN', kind: 'ORGANIZATION', scopes: ['r_organization_social'] }).availability).toBe('full');
  });

  it('Instagram sem insights: parcial, pede reconexão', () => {
    const r = metricsAvailability({ ...base, provider: 'INSTAGRAM', kind: 'ORGANIZATION', scopes: ['instagram_business_basic'] });
    expect(r.availability).toBe('partial');
    expect(r.message).toMatch(/Reconecte o Instagram/);
  });

  it('conta desligada: indisponível', () => {
    expect(metricsAvailability({ provider: 'INSTAGRAM', kind: 'PERSON', scopes: [], isActive: false, hasToken: false }).availability).toBe('unavailable');
  });
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('importação de posts publicados fora do CRM', () => {
  it('Instagram: lê a página e para no que é mais antigo que o limite', async () => {
    const since = new Date('2026-05-01T00:00:00Z');
    const fetchImpl = (async () =>
      json({
        data: [
          { id: '1', caption: 'Novo', permalink: 'https://instagram.com/p/1', timestamp: '2026-10-01T12:00:00+0000' },
          { id: '2', caption: 'Velho', permalink: 'https://instagram.com/p/2', timestamp: '2026-01-01T12:00:00+0000' },
        ],
        paging: { next: 'https://graph.instagram.com/next' },
      })) as unknown as typeof fetch;
    const posts = (await listInstagramMedia({ externalId: '17841' }, 'tok', since, fetchImpl)).filter((p) => p.type !== 'STORY');
    expect(posts.map((p) => p.externalId)).toEqual(['1']);
    expect(posts[0]!.url).toBe('https://instagram.com/p/1');
  });

  it('LinkedIn Página: só posts publicados e dentro do limite', async () => {
    const since = new Date('2026-05-01T00:00:00Z');
    const fetchImpl = (async () =>
      json({
        elements: [
          { id: 'urn:li:share:1', commentary: 'Olá', lifecycleState: 'PUBLISHED', publishedAt: Date.parse('2026-10-02T10:00:00Z') },
          { id: 'urn:li:share:2', commentary: 'Rascunho', lifecycleState: 'DRAFT', createdAt: Date.parse('2026-10-02T10:00:00Z') },
        ],
      })) as unknown as typeof fetch;
    const posts = await listLinkedinOrganizationPosts({ externalId: '123' }, 'tok', since, fetchImpl);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toBe('https://www.linkedin.com/feed/update/urn:li:share:1/');
  });
});
