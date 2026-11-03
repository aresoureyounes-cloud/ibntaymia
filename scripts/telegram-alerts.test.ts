import { describe, test, expect } from "bun:test";
import { normalizeGuardianPhone, smsComposerLink, canPrepareSms, preparedSms, type TelegramAlert } from "../src/lib/telegram-alerts";
// Synthetic fixture only; never copies a real guardian's contact details.
const alert: TelegramAlert = { id: "test", event_type: "غياب", student_name: "تلميذ تجريبي", class_name: "قسم تجريبي", guardian_name: "ولي تجريبي", guardian_phone: "0550000000", details: "تجربة", event_at: "2026-10-23", is_test: true, decision: "pending", telegram_status: "accepted" };
describe("guardian SMS decisions", () => {
  test("guardian number is normalized as Algerian mobile", () => expect(normalizeGuardianPhone("0550000000")).toBe("+213550000000"));
  test("composer targets the specified guardian with prepared event", () => {
    const url = smsComposerLink("0550000000", preparedSms(alert), false);
    expect(url.split("?")[0]).toBe("sms:+213550000000");
    expect(decodeURIComponent(url.split("body=")[1])).toContain("تلميذ تجريبي");
    expect(decodeURIComponent(url.split("body=")[1])).toContain("ولي تجريبي");
    expect(decodeURIComponent(url.split("body=")[1])).toContain("قسم تجريبي");
  });
  test("ignore prevents composing", () => expect(canPrepareSms({ ...alert, decision: "ignored" })).toBe(false));
  test("cancelled corrected event prevents composing", () => expect(canPrepareSms({ ...alert, decision: "cancelled" })).toBe(false));
  test("missing guardian phone cannot compose", () => expect(canPrepareSms({ ...alert, guardian_phone: null })).toBe(false));
  test("Apple composer has its own separator", () => expect(smsComposerLink("0550000000", "غياب", true)).toBe("sms:+213550000000&body=%D8%BA%D9%8A%D8%A7%D8%A8"));
  test("composer opens messages scheme with the entire supplied message, not a browser URL", () => {
    const body = preparedSms(alert);
    const link = smsComposerLink("0550000000", body, false);
    expect(link.startsWith("sms:+213550000000?body=")).toBe(true);
    expect(decodeURIComponent(link.slice(link.indexOf("body=") + 5))).toBe(body);
    expect(link.startsWith("https:")).toBe(false);
  });
});