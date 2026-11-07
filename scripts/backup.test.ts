import { describe, expect, test } from "bun:test";
import { isBackupDue, toCsv } from "../src/lib/backup";

describe("desktop backup", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  test("first backup is due", () => expect(isBackupDue(null, now)).toBe(true));
  test("not due after 29 hours", () => expect(isBackupDue(new Date(now - 29 * 3600e3).toISOString(), now)).toBe(false));
  test("due after 30 hours", () => expect(isBackupDue(new Date(now - 30 * 3600e3).toISOString(), now)).toBe(true));
  test("CSV escapes commas and quotes", () => {
    expect(toCsv([{ a: 'x,"y"', b: null }])).toBe('\uFEFFa,b\r\n"x,""y""",');
  });
});
