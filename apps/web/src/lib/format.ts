const metres = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const coord = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 7,
  maximumFractionDigits: 7,
});
const percent = new Intl.NumberFormat('vi-VN', { style: 'percent', maximumFractionDigits: 0 });

const ok = (v: number | null | undefined): v is number =>
  v !== null && v !== undefined && Number.isFinite(v);

export const fmtM = (v: number | null | undefined) => (ok(v) ? `${metres.format(v)} m` : '—');
export const fmtSignedM = (v: number | null | undefined) =>
  ok(v) ? `${v > 0 ? '+' : ''}${metres.format(v)} m` : '—';
export const fmtCoord = (v: number | null | undefined) => (ok(v) ? coord.format(v) : '—');
export const fmtPercent = (v: number | null | undefined) => (ok(v) ? percent.format(v) : '—');

export const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

export const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Accepts both "20,00" (Vietnamese) and "20.00". Returns null for anything else. */
export function parseMetres(input: string): number | null {
  const s = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const v = Number(s);
  return v > 0 ? v : null;
}
