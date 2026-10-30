export type LegalSettings = {
  notice1_days: number;
  notice2_days: number;
  notice3_days: number;
  strike_off_days: number;
};

export const NOTICE_LABEL: Record<number, string> = {
  1: "الإشعار الأول",
  2: "الإشعار الثاني",
  3: "الإعذار (الإشعار الثالث)",
};

/** Highest notice level the unjustified-day count has reached (0 = none). */
export function levelReached(days: number, s: LegalSettings): 0 | 1 | 2 | 3 {
  if (days >= s.notice3_days) return 3;
  if (days >= s.notice2_days) return 2;
  if (days >= s.notice1_days) return 1;
  return 0;
}

/** Next notice to issue: notices go in order, never skipping one. */
export function nextNoticeDue(days: number, lastLevel: number | null, s: LegalSettings): 0 | 1 | 2 | 3 {
  const last = lastLevel ?? 0;
  if (last >= 3) return 0;
  return levelReached(days, s) > last ? ((last + 1) as 1 | 2 | 3) : 0;
}

/** Strike-off is only a suggestion; requires the 3rd notice and the threshold. */
export function strikeOffSuggested(days: number, lastLevel: number | null, s: LegalSettings): boolean {
  return (lastLevel ?? 0) >= 3 && days >= s.strike_off_days;
}

export type Slot = {
  id: string;
  class_id: string;
  teacher_id: string | null;
  weekday: number;
  start_time: string;
  end_time: string;
  subject: string;
  is_active?: boolean;
};
export type TeacherAbsence = { teacher_id: string; slot_ids: string[] | null };

/** Slots of a weekday left without their teacher because of a recorded absence. */
export function freeSlots(slots: Slot[], absences: TeacherAbsence[], weekday: number): Slot[] {
  return slots.filter((sl) => {
    if (sl.weekday !== weekday || sl.is_active === false || !sl.teacher_id) return false;
    const a = absences.find((x) => x.teacher_id === sl.teacher_id);
    if (!a) return false;
    return !a.slot_ids || a.slot_ids.length === 0 || a.slot_ids.includes(sl.id);
  });
}

const overlaps = (a: Slot, b: Slot) => a.start_time < b.end_time && b.start_time < a.end_time;

/** Teachers not teaching at that time and not absent that day. */
export function availableTeachers(
  target: Slot,
  slots: Slot[],
  teacherIds: string[],
  absentIds: string[],
): string[] {
  const busy = new Set(
    slots
      .filter((s) => s.weekday === target.weekday && s.is_active !== false && s.teacher_id && overlaps(s, target))
      .map((s) => s.teacher_id as string),
  );
  return teacherIds.filter((t) => !busy.has(t) && !absentIds.includes(t));
}
