import { describe, expect, test } from "bun:test";
import { availableTeachers, freeSlots, nextNoticeDue, strikeOffSuggested, type Slot } from "../src/lib/legal-path";

const s = { notice1_days: 3, notice2_days: 6, notice3_days: 10, strike_off_days: 15 };

describe("legal absence path", () => {
  test("no notice below first threshold", () => expect(nextNoticeDue(2, null, s)).toBe(0));
  test("first notice at 3 unjustified days", () => expect(nextNoticeDue(3, null, s)).toBe(1));
  test("notices never skip a level", () => expect(nextNoticeDue(12, null, s)).toBe(1));
  test("second notice after first at 6 days", () => expect(nextNoticeDue(6, 1, s)).toBe(2));
  test("nothing after the third notice", () => expect(nextNoticeDue(20, 3, s)).toBe(0));
  test("strike-off needs the third notice", () => expect(strikeOffSuggested(20, 2, s)).toBe(false));
  test("strike-off suggested at 15 days after third notice", () => expect(strikeOffSuggested(15, 3, s)).toBe(true));
});

const slot = (id: string, teacher: string, start: string, end: string, weekday = 0): Slot => ({
  id, class_id: "c" + id, teacher_id: teacher, weekday, start_time: start, end_time: end, subject: "x",
});

describe("free periods", () => {
  const slots = [slot("1", "A", "08:00", "09:00"), slot("2", "A", "09:00", "10:00"), slot("3", "B", "08:00", "09:00")];
  test("full-day absence frees all of that teacher's slots", () =>
    expect(freeSlots(slots, [{ teacher_id: "A", slot_ids: null }], 0).map((x) => x.id)).toEqual(["1", "2"]));
  test("partial absence frees only the chosen slots", () =>
    expect(freeSlots(slots, [{ teacher_id: "A", slot_ids: ["2"] }], 0).map((x) => x.id)).toEqual(["2"]));
  test("busy and absent teachers are not proposed", () =>
    expect(availableTeachers(slots[0], slots, ["A", "B", "C"], ["A"])).toEqual(["C"]));
});
