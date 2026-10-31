import { describe, expect, it } from "vitest";
import { formatKroner, parseKroner } from "./money";

describe("formatKroner", () => {
  it("viser hele kroner uden decimaler", () => {
    expect(formatKroner(182000)).toBe("1.820 kr.");
  });
  it("viser øre, når der er nogen", () => {
    expect(formatKroner(27050)).toBe("270,50 kr.");
  });
});

describe("parseKroner", () => {
  it.each([
    ["270", 27000],
    ["270,50", 27050],
    ["270,5", 27050],
    ["1.820", 182000],
    ["1.820,25", 182025],
    ["1820.5", 182050],
    ["  300 kr. ", 30000],
  ])("%s → %i øre", (input, ore) => {
    expect(parseKroner(input)).toBe(ore);
  });

  it("tom tekst er ingen pris", () => {
    expect(parseKroner("  ")).toBeNull();
  });

  it.each(["abc", "-10", "12,345", "1,2,3"])("afviser %s", (input) => {
    expect(parseKroner(input)).toBeNaN();
  });
});
