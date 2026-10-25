// Plain calendar dates as "YYYY-MM-DD" in local time. Plans work with these, never with
// timestamps, so a date never shifts with the time zone.

const pad = (n: number) => String(n).padStart(2, '0');

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && toIso(parseIso(s)) === s;
}

export function addDays(s: string, n: number): string {
  const d = parseIso(s);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(s: string): number {
  return (parseIso(s).getDay() + 6) % 7;
}

export function mondayOf(s: string): string {
  return addDays(s, -weekdayIndex(s));
}

const utc = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Whole days from a to b (negative when b is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** "Mo, 12. Okt." */
export function formatDay(s: string): string {
  const d = parseIso(s);
  return `${WEEKDAYS_SHORT[weekdayIndex(s)]}, ${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}`;
}
