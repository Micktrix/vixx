import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["20456789", "+4520456789"],
    ["20 45 67 89", "+4520456789"],
    ["+45 20 45 67 89", "+4520456789"],
    ["004520456789", "+4520456789"],
    ["+46 70 123 45 67", "+46701234567"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "1234", "2045678", "204567890", "+45 2045 678", "abcdefgh", "+0123456789"])("afviser %s", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("formatPhone", () => {
  it("viser danske numre i par", () => {
    expect(formatPhone("+4520456789")).toBe("+45 20 45 67 89");
  });
  it("viser andre lande uændret", () => {
    expect(formatPhone("+46701234567")).toBe("+46701234567");
  });
});
