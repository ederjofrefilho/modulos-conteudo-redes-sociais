import { describe, expect, it } from 'vitest';
import {
  canApprove,
  canArchive,
  canRetry,
  canSchedule,
  changedContentFields,
  isDue,
  statusAfterEdit,
  type EditablePost,
} from './status.js';

const post = (over: Partial<EditablePost> = {}): EditablePost => ({
  status: 'APPROVED',
  text: 'Olá',
  mediaAssetIds: ['a', 'b'],
  linkUrl: null,
  socialAccountId: 'acc1',
  ...over,
});

describe('statusAfterEdit', () => {
  it('editar texto de um aprovado volta para rascunho e limpa a aprovação', () => {
    expect(statusAfterEdit(post(), { text: 'Outro' })).toEqual({ status: 'DRAFT', resetsApproval: true });
  });

  it('reordenar imagens conta como mudança de conteúdo', () => {
    expect(statusAfterEdit(post(), { mediaAssetIds: ['b', 'a'] }).status).toBe('DRAFT');
  });

  it('trocar o destino desaprova', () => {
    expect(statusAfterEdit(post(), { socialAccountId: 'acc2' }).resetsApproval).toBe(true);
  });

  it('patch igual ao atual (ou sem campo de conteúdo) não desaprova', () => {
    const same = statusAfterEdit(post(), { text: 'Olá', mediaAssetIds: ['a', 'b'], linkUrl: null });
    expect(same).toEqual({ status: 'APPROVED', resetsApproval: false });
    expect(statusAfterEdit(post(), {})).toEqual({ status: 'APPROVED', resetsApproval: false });
  });

  it('editar FAILED volta para rascunho; DRAFT continua DRAFT sem "reset"', () => {
    expect(statusAfterEdit(post({ status: 'FAILED' }), { text: 'x' })).toEqual({ status: 'DRAFT', resetsApproval: true });
    expect(statusAfterEdit(post({ status: 'DRAFT' }), { text: 'x' })).toEqual({ status: 'DRAFT', resetsApproval: false });
  });

  it('publicado, publicando e arquivado não editam', () => {
    for (const status of ['PUBLISHED', 'PUBLISHING', 'ARCHIVED'] as const) {
      expect(() => statusAfterEdit(post({ status }), { text: 'x' })).toThrow();
    }
  });

  it('changedContentFields lista só o que mudou', () => {
    expect(changedContentFields(post(), { text: 'x', linkUrl: null })).toEqual(['text']);
  });
});

describe('guardas de transição', () => {
  it('só rascunho aprova', () => {
    expect(canApprove('DRAFT')).toBeNull();
    expect(canApprove('APPROVED')).not.toBeNull();
    expect(canApprove('FAILED')).not.toBeNull();
  });
  it('só FAILED tenta de novo', () => {
    expect(canRetry('FAILED')).toBeNull();
    expect(canRetry('PUBLISHED')).not.toBeNull();
  });
  it('não arquiva em voo', () => {
    expect(canArchive('PUBLISHING')).not.toBeNull();
    expect(canArchive('PUBLISHED')).toBeNull();
  });
  it('horário muda em rascunho e aprovado', () => {
    expect(canSchedule('DRAFT')).toBeNull();
    expect(canSchedule('APPROVED')).toBeNull();
    expect(canSchedule('PUBLISHED')).not.toBeNull();
  });
});

describe('isDue — escolha dos posts vencidos', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  it('aprovado sem horário = publicar já', () => {
    expect(isDue({ status: 'APPROVED', scheduledAt: null, externalId: null }, now)).toBe(true);
  });
  it('aprovado com horário vencido sim; futuro não', () => {
    expect(isDue({ status: 'APPROVED', scheduledAt: new Date('2026-10-10T11:59:00Z'), externalId: null }, now)).toBe(true);
    expect(isDue({ status: 'APPROVED', scheduledAt: new Date('2026-10-10T12:01:00Z'), externalId: null }, now)).toBe(false);
  });
  it('rascunho nunca; com externalId nunca (já foi ao ar)', () => {
    expect(isDue({ status: 'DRAFT', scheduledAt: null, externalId: null }, now)).toBe(false);
    expect(isDue({ status: 'APPROVED', scheduledAt: null, externalId: 'urn:li:share:1' }, now)).toBe(false);
  });
});
