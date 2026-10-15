import { describe, expect, it } from 'vitest';
import { atLeast, canManageAccount, resolveAccess } from './access-rules.js';
import { readRemote, remoteFormat, remoteThumb } from './remote.js';

const admin = { id: 'a', role: 'ADMIN' };
const ana = { id: 'ana', role: 'MEMBER' };
const bia = { id: 'bia', role: 'MEMBER' };

describe('resolveAccess', () => {
  it('conta pessoal: só o dono (e ADMIN) tem acesso, sempre total', () => {
    const personal = { shared: false, ownerId: 'ana' };
    expect(resolveAccess(personal, ana)).toEqual({ level: 'PUBLISH', metrics: true, owner: true });
    expect(resolveAccess(personal, bia).level).toBe('NONE');
    // Uma permissão numa conta pessoal não vale (só contas da empresa têm permissões).
    expect(resolveAccess(personal, bia, { level: 'PUBLISH', canViewMetrics: true }).level).toBe('NONE');
    expect(resolveAccess(personal, admin).level).toBe('PUBLISH');
  });

  it('conta da empresa: o nível dado; sem linha, sem acesso; métricas à parte', () => {
    const shared = { shared: true, ownerId: null };
    expect(resolveAccess(shared, ana).level).toBe('NONE');
    expect(resolveAccess(shared, ana, { level: 'DRAFT', canViewMetrics: false })).toEqual({ level: 'DRAFT', metrics: false, owner: false });
    expect(resolveAccess(shared, admin)).toMatchObject({ level: 'PUBLISH', metrics: true });
  });

  it('dono apagado não torna a conta pessoal partilhada', () => {
    expect(resolveAccess({ shared: false, ownerId: null }, ana).level).toBe('NONE');
  });

  it('níveis cumulativos e quem gere', () => {
    expect(atLeast('PUBLISH', 'DRAFT')).toBe(true);
    expect(atLeast('VIEW', 'DRAFT')).toBe(false);
    expect(canManageAccount({ shared: true, ownerId: null }, ana)).toBe(false);
    expect(canManageAccount({ shared: true, ownerId: null }, admin)).toBe(true);
    expect(canManageAccount({ shared: false, ownerId: 'ana' }, ana)).toBe(true);
  });
});

describe('remote', () => {
  it('lê o JSON guardado, ignora lixo e escolhe a cópia do CRM como miniatura', () => {
    expect(readRemote(null)).toBeNull();
    expect(readRemote({ type: 'ALGO' })).toBeNull();
    const r = readRemote({
      type: 'CAROUSEL',
      items: [
        { kind: 'image', url: 'https://cdn/expira.jpg', thumbUrl: null },
        { kind: 'video', url: 'https://cdn/v.mp4', thumbUrl: 'https://blob/v.jpg' },
        'lixo',
      ],
      syncedAt: '2026-10-14T00:00:00Z',
    });
    expect(r?.items).toHaveLength(2);
    expect(remoteThumb(r)).toBe('https://blob/v.jpg');
    expect(remoteThumb(readRemote({ type: 'IMAGE', items: [{ kind: 'image', url: 'https://cdn/a.jpg' }] }))).toBe('https://cdn/a.jpg');
  });

  it('tipo na rede → formato do painel', () => {
    expect(remoteFormat('REEL')).toBe('VIDEO');
    expect(remoteFormat('DOCUMENT')).toBe('CAROUSEL');
    expect(remoteFormat('ARTICLE')).toBe('LINK');
    expect(remoteFormat('STORY')).toBe('IMAGE');
  });
});
