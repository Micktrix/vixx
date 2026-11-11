import { describe, expect, it } from "vitest";
import { authFieldsForPhone, firstPassword, loginEmailForPhone } from "./login-identity";

describe("login-identitet", () => {
  it("afleder den interne login-adresse af telefonnummeret", () => {
    expect(loginEmailForPhone("+4520456789")).toBe("4520456789@login.vixx.dk");
  });

  it("gemmer også telefonnummeret på auth-brugeren", () => {
    expect(authFieldsForPhone("+4520456789")).toMatchObject({ phone: "4520456789", phone_confirm: true });
  });
});

describe("første kode", () => {
  it("er telefonnummeret, som man skriver det", () => {
    expect(firstPassword("+4520456789")).toBe("20456789");
    expect(firstPassword("+46701234567")).toBe("46701234567");
  });
});
