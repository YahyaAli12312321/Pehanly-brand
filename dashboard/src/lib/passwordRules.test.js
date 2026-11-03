import { describe, expect, it } from "vitest";
import { passwordChecks, validateEmail, validateIdentifier, validateNewPassword } from "./passwordRules";

describe("passwordRules", () => {
  it("mirrors the backend 8-72 character rule", () => {
    expect(validateNewPassword("short", "short").password).toMatch(/at least 8/i);
    expect(validateNewPassword("x".repeat(73), "x".repeat(73)).password).toMatch(/at most 72/i);
    expect(validateNewPassword("long-enough-1", "long-enough-1")).toEqual({});
  });
  it("requires a matching confirmation", () => {
    expect(validateNewPassword("long-enough-1", "different").confirm).toMatch(/do not match/i);
    expect(validateNewPassword("long-enough-1", "").confirm).toMatch(/confirm/i);
  });
  it("reports live check state", () => {
    const c = Object.fromEntries(passwordChecks("abcdefgh", "abcdefgh").map((x) => [x.id, x.ok]));
    expect(c).toEqual({ min: true, max: true, match: true });
    expect(passwordChecks("abc", "").every((x) => !x.ok || x.id === "max")).toBe(true);
  });
  it("accepts an email or a phone as the login identifier", () => {
    expect(validateIdentifier("owner@pehanly.pk")).toBeNull();
    expect(validateIdentifier("03001234567")).toBeNull();
    expect(validateIdentifier("  ")).toMatch(/enter/i);
    expect(validateIdentifier("ab")).toMatch(/valid/i);
  });
  it("validates the forgot-password email", () => {
    expect(validateEmail("a@b.co")).toBeNull();
    expect(validateEmail("nope")).toMatch(/valid/i);
    expect(validateEmail("")).toMatch(/enter/i);
  });
});

import { fieldForConflict, validateName, validatePhone, validateRegistration } from "./passwordRules";

describe("registration rules (mirror POST /auth/register)", () => {
  const ok = { name: "Ayesha Khan", email: "a@x.pk", phone: "03001234567", password: "long-enough-1", confirm: "long-enough-1" };
  it("accepts a valid registration", () => expect(validateRegistration(ok)).toEqual({}));
  it("checks every field", () => {
    const e = validateRegistration({ name: "A", email: "nope", phone: "123", password: "short", confirm: "other" });
    expect(Object.keys(e).sort()).toEqual(["confirm", "email", "name", "password", "phone"]);
  });
  it("uses password wording, not 'new password'", () => {
    const e = validateRegistration({ ...ok, password: "", confirm: "" });
    expect(e.password).toBe("Enter a password");
    expect(e.confirm).toBe("Confirm your password");
  });
  it("matches backend length limits", () => {
    expect(validateName("x".repeat(121))).toMatch(/at most 120/);
    expect(validatePhone("1".repeat(21))).toMatch(/at most 20/);
  });
  it("maps duplicate-account messages to a field", () => {
    expect(fieldForConflict("An account with this email already exists")).toBe("email");
    expect(fieldForConflict("An account with this phone number already exists")).toBe("phone");
    expect(fieldForConflict("other")).toBeNull();
  });
});
