import { describe, expect, test } from "bun:test";
import { canManageInstitution, emptyInstitution, institutionSchema, requirePublishedOrigin } from "../src/lib/institution";

describe("independent institution deployment", () => {
  test("new institution has no inherited school identity or URL", () => {
    expect(emptyInstitution).toEqual({ name: "", address: "", phone: "", email: "", academic_year: "", logo_data_url: "", published_origin: "" });
  });
  test("only administrative roles manage the institution", () => {
    for (const role of ["admin", "director", "developer"]) expect(canManageInstitution([role])).toBe(true);
    for (const role of ["teacher", "supervisor", "parent", "student", "gate_monitor"]) expect(canManageInstitution([role])).toBe(false);
    expect(canManageInstitution([])).toBe(false);
  });
  test("dispatch fails closed without a published institution URL", () => {
    expect(() => requirePublishedOrigin(null)).toThrow();
    expect(() => requirePublishedOrigin("")).toThrow();
  });
  test("independent institutions keep their own dispatch origin", () => {
    expect(requirePublishedOrigin("https://school-a.example.org")).toBe("https://school-a.example.org");
    expect(requirePublishedOrigin("https://school-b.example.org")).toBe("https://school-b.example.org");
  });
  test("dispatch rejects insecure URLs, paths and credentials", () => {
    for (const url of ["http://school.example.org", "https://school.example.org/dashboard", "https://user:pass@school.example.org", "https://school.example.org?x=1", "javascript:alert(1)"]) expect(() => requirePublishedOrigin(url)).toThrow();
  });
  test("logo allows embedded raster images but rejects scripts and remote tracking", () => {
    expect(institutionSchema.safeParse({ ...emptyInstitution, name: "مؤسسة تجريبية", logo_data_url: "data:image/png;base64,YWJj" }).success).toBe(true);
    for (const logo of ["data:image/svg+xml;base64,YWJj", "https://external.example.org/tracking.png"]) expect(institutionSchema.safeParse({ ...emptyInstitution, name: "مؤسسة تجريبية", logo_data_url: logo }).success).toBe(false);
  });
});