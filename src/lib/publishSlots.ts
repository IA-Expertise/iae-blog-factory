/** Dias da semana ISO-8601: 1 = segunda ... 7 = domingo */

export function parseWeekdays(input: string | null | undefined): number[] {
  if (!input?.trim()) return [];
  return input
    .split(/[,;\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7);
}

export function getUtcIsoWeekday(d: Date): number {
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Proximos horarios de publicacao em UTC (hora fixa `hourUtc` nos dias permitidos).
 */
export function nextPublishSlotsUtc(from: Date, weekdays: number[], hourUtc: number, count: number): Date[] {
  const slots: Date[] = [];
  if (!weekdays.length || count <= 0) return [];
  const allowed = new Set(weekdays);
  const anchor = new Date(from);
  anchor.setUTCSeconds(0, 0);

  for (let i = 0; slots.length < count && i < 800; i++) {
    const d = new Date(anchor);
    d.setUTCDate(d.getUTCDate() + i);
    d.setUTCHours(hourUtc, 0, 0, 0);
    if (d <= from) continue;
    if (allowed.has(getUtcIsoWeekday(d))) slots.push(d);
  }
  return slots;
}
