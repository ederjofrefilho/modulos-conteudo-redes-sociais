import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LINKEDIN_PAGE_SCOPES,
  connectLinkedinPagesFromCode,
  listAdministeredOrganizations,
  missingPageScopes,
} from './linkedin-pages.js';
import { linkedinAuthorizeUrl, linkedinPagesCredentials } from './providers/linkedin.js';

const ctx = { userId: 'u1', role: 'ADMIN' } as never;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => vi.unstubAllEnvs());

describe('linkedinPagesCredentials', () => {
  it('usa o app próprio das Páginas quando as duas envs existem', () => {
    const creds = linkedinPagesCredentials({
      LINKEDIN_CLIENT_ID: 'perfil',
      LINKEDIN_CLIENT_SECRET: 's1',
      LINKEDIN_PAGES_CLIENT_ID: 'paginas',
      LINKEDIN_PAGES_CLIENT_SECRET: 's2',
    });
    expect(creds).toEqual({ clientId: 'paginas', clientSecret: 's2', separate: true });
  });

  it('cai no app de sempre sem as envs das Páginas (ou com só uma delas)', () => {
    expect(
      linkedinPagesCredentials({ LINKEDIN_CLIENT_ID: 'perfil', LINKEDIN_CLIENT_SECRET: 's1', LINKEDIN_PAGES_CLIENT_ID: 'x' }),
    ).toEqual({ clientId: 'perfil', clientSecret: 's1', separate: false });
    expect(linkedinPagesCredentials({})).toBeNull();
  });
});

describe('linkedinAuthorizeUrl no app só de Páginas', () => {
  it('pede só as permissões de Página, sem OpenID nem publicar no perfil', () => {
    const url = new URL(
      linkedinAuthorizeUrl({ clientId: 'c', redirectUri: 'https://crm/cb', state: 's', baseScopes: [], extraScopes: LINKEDIN_PAGE_SCOPES }),
    );
    expect(url.searchParams.get('scope')).toBe(LINKEDIN_PAGE_SCOPES.join(' '));
  });

  it('mantém as permissões de base por omissão', () => {
    const url = new URL(linkedinAuthorizeUrl({ clientId: 'c', redirectUri: 'https://crm/cb', state: 's' }));
    expect(url.searchParams.get('scope')).toBe('openid profile w_member_social');
  });
});

describe('missingPageScopes', () => {
  it('exige listar as Páginas e publicar nelas', () => {
    expect(missingPageScopes([...LINKEDIN_PAGE_SCOPES])).toEqual([]);
    expect(missingPageScopes(['r_organization_social'])).toEqual(['rw_organization_admin', 'w_organization_social']);
  });
});

describe('listAdministeredOrganizations', () => {
  it('lê as Páginas administradas, sem repetir, com o nome de cada uma', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/organizationAcls'))
        return json({
          elements: [{ organization: 'urn:li:organization:42' }, { organization: 'urn:li:organization:42' }],
        });
      return json({ localizedName: 'empresa' });
    }) as typeof fetch;
    expect(await listAdministeredOrganizations('tok', fetchImpl)).toEqual([{ id: '42', name: 'empresa' }]);
    expect(calls).toHaveLength(2);
  });
});

describe('connectLinkedinPagesFromCode', () => {
  it('troca o código com o app das Páginas e recusa token sem as permissões de Página', async () => {
    vi.stubEnv('LINKEDIN_PAGES_CLIENT_ID', 'paginas');
    vi.stubEnv('LINKEDIN_PAGES_CLIENT_SECRET', 'segredo');
    let tokenBody = '';
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      tokenBody = String(init?.body ?? '');
      return json({ access_token: 't', expires_in: 3600, scope: 'r_organization_social' });
    }) as typeof fetch;
    await expect(
      connectLinkedinPagesFromCode({ code: 'c', redirectUri: 'https://crm/cb', fetchImpl }, ctx),
    ).rejects.toThrow(/rw_organization_admin, w_organization_social/);
    expect(new URLSearchParams(tokenBody).get('client_id')).toBe('paginas');
  });

  it('explica quando a pessoa não administra nenhuma Página', async () => {
    vi.stubEnv('LINKEDIN_PAGES_CLIENT_ID', 'paginas');
    vi.stubEnv('LINKEDIN_PAGES_CLIENT_SECRET', 'segredo');
    const fetchImpl = (async (input: RequestInfo | URL) =>
      String(input).includes('accessToken')
        ? json({ access_token: 't', expires_in: 3600, scope: LINKEDIN_PAGE_SCOPES.join(',') })
        : json({ elements: [] })) as typeof fetch;
    await expect(
      connectLinkedinPagesFromCode({ code: 'c', redirectUri: 'https://crm/cb', fetchImpl }, ctx),
    ).rejects.toThrow(/administrador da Página/);
  });
});
