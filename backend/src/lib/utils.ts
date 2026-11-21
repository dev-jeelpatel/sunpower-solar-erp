export const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return '';
  const s = String(v instanceof Date ? v.toISOString() : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
};

/** Working day (skips Sunday) at least `days` ahead, as YYYY-MM-DD. */
export function workingDayFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const today = () => new Date().toISOString().slice(0, 10);
