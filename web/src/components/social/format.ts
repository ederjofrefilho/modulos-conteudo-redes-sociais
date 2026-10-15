/** "12 out., 14:30" — ou "Assim que aprovar" quando não há horário (ou já passou). */
export function formatWhen(iso: string | null): string {
  if (!iso) return 'Assim que aprovar';
  const date = new Date(iso);
  if (date.getTime() <= Date.now()) return 'Assim que aprovar (o horário marcado já passou)';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** ISO → valor de campo de data e hora local, no fuso do navegador. */
export function toLocalInput(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
