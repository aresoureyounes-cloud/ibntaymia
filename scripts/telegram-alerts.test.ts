import { describe, test, expect } from "bun:test";
import { normalizeGuardianPhone, smsComposerLink, canPrepareSms, preparedSms, type TelegramAlert } from "../src/lib/telegram-alerts";
const alert: TelegramAlert = { id: "test", event_type: "غياب", student_name: "بوكعاش يونس", class_name: "2رياضي", guardian_name: "مهدي بوكعاش", guardian_phone: "0563691828", details: "تجربة", event_at: "2026-10-23", is_test: true, decision: "pending", telegram_status: "accepted" };
describe("guardian SMS decisions", () => {
  test("user supplied guardian number is preserved as Algerian mobile", () => expect(normalizeGuardianPhone("0563691828")).toBe("+213563691828"));
  test("composer targets the specified guardian with prepared event", () => {
    const url = smsComposerLink("0563691828", preparedSms(alert), false);
    expect(url.split("?")[0]).toBe("sms:+213563691828");
    expect(decodeURIComponent(url.split("body=")[1])).toContain("بوكعاش يونس");
    expect(decodeURIComponent(url.split("body=")[1])).toContain("مهدي بوكعاش");
    expect(decodeURIComponent(url.split("body=")[1])).toContain("2رياضي");
  });
  test("ignore prevents composing", () => expect(canPrepareSms({ ...alert, decision: "ignored" })).toBe(false));
  test("cancelled corrected event prevents composing", () => expect(canPrepareSms({ ...alert, decision: "cancelled" })).toBe(false));
  test("missing guardian phone cannot compose", () => expect(canPrepareSms({ ...alert, guardian_phone: null })).toBe(false));
  test("Apple composer has its own separator", () => expect(smsComposerLink("0563691828", "غياب", true)).toBe("sms:+213563691828&body=%D8%BA%D9%8A%D8%A7%D8%A8"));
  test("composer opens messages scheme with the entire supplied message, not a browser URL", () => {
    const body = preparedSms(alert);
    const link = smsComposerLink("0563691828", body, false);
    expect(link.startsWith("sms:+213563691828?body=")).toBe(true);
    expect(decodeURIComponent(link.slice(link.indexOf("body=") + 5))).toBe(body);
    expect(link.startsWith("https:")).toBe(false);
  });
});