export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export type Slot = {
  id: string;
  subject: string;
  weekday: number;
  start_time: string;
  end_time: string;
  room: string | null;
};

/** "08:30:00" -> minutes since midnight */
export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function fmtTime(t: string): string {
  return t.slice(0, 5);
}

/** Returns the next upcoming slot relative to `now`, searching up to 7 days ahead. */
export function nextSlot(slots: Slot[], now: Date): { slot: Slot; at: Date } | null {
  if (!slots.length) return null;
  for (let d = 0; d < 8; d++) {
    const day = new Date(now);
    day.setDate(now.getDate() + d);
    const wd = day.getDay();
    const todays = slots
      .filter((s) => s.weekday === wd)
      .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
    for (const s of todays) {
      const at = new Date(day);
      at.setHours(0, 0, 0, 0);
      at.setMinutes(toMinutes(s.start_time));
      if (at.getTime() > now.getTime()) return { slot: s, at };
    }
  }
  return null;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Consecutive days (most recent first) where the student was present and never absent. */
export function attendanceStreak(records: { status: string; date: string | null }[]): number {
  const byDate = new Map<string, string[]>();
  for (const r of records) {
    if (!r.date) continue;
    byDate.set(r.date, [...(byDate.get(r.date) ?? []), r.status]);
  }
  const dates = [...byDate.keys()].sort().reverse();
  let streak = 0;
  for (const d of dates) {
    const statuses = byDate.get(d)!;
    if (statuses.includes("absent")) break;
    if (statuses.includes("present") || statuses.includes("late")) streak++;
    else break;
  }
  return streak;
}

/** Calendar cells for a month: leading blanks + day numbers. */
export function monthGrid(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: first }, () => null);
  for (let i = 1; i <= days; i++) cells.push(i);
  return cells;
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
