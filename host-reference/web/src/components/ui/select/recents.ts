import type { SelectOption } from './parts';

const PREFIX = 'select-recents:';
const MAX = 5;

/** Últimas escolhas de um seletor de entidades (por navegador, `localStorage`). */
export function readRecents(key: string): SelectOption[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFIX + key) ?? '[]');
    return Array.isArray(raw) ? raw.filter((o) => o && typeof o.value === 'string' && typeof o.label === 'string') : [];
  } catch {
    return [];
  }
}

export function pushRecent(key: string, option: SelectOption) {
  try {
    const { value, label, hint, avatarLabel, avatarSquare } = option;
    const next = [{ value, label, hint, avatarLabel, avatarSquare }, ...readRecents(key).filter((o) => o.value !== value)];
    localStorage.setItem(PREFIX + key, JSON.stringify(next.slice(0, MAX)));
  } catch {
    // Sem armazenamento (janela privada): o seletor funciona igual, só sem recentes.
  }
}
