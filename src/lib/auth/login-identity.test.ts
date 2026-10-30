import { describe, expect, it } from "vitest";
import { authFieldsForPhone, loginEmailForPhone } from "./login-identity";
import { generateTempPassword } from "./temp-password";

describe("login-identitet", () => {
  it("afleder den interne login-adresse af telefonnummeret", () => {
    expect(loginEmailForPhone("+4520456789")).toBe("4520456789@login.vixx.dk");
  });

  it("gemmer også telefonnummeret på auth-brugeren", () => {
    expect(authFieldsForPhone("+4520456789")).toMatchObject({ phone: "4520456789", phone_confirm: true });
  });
});

describe("midlertidig kode", () => {
  it("er 10 tegn uden tegn der let forveksles", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateTempPassword();
      expect(code).toHaveLength(10);
      expect(code).not.toMatch(/[0O1lI]/);
    }
  });
});
