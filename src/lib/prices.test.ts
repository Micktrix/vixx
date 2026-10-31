import { describe, expect, it } from "vitest";
import { nextPriceAfter, priceOn } from "./prices";

const prices = [
  { valid_from: "2026-01-01", amount_ore: 22000 },
  { valid_from: "2026-11-01", amount_ore: 23500 },
  { valid_from: "2026-06-01", amount_ore: 22500 },
];

describe("priceOn", () => {
  it("bruger den seneste pris på eller før datoen", () => {
    expect(priceOn(prices, "2026-10-31")?.amount_ore).toBe(22500);
  });
  it("en ny pris gælder fra og med sin dato", () => {
    expect(priceOn(prices, "2026-11-01")?.amount_ore).toBe(23500);
  });
  it("før første pris gælder den første pris", () => {
    expect(priceOn(prices, "2025-12-31")?.amount_ore).toBe(22000);
  });
  it("uden priser findes ingen pris", () => {
    expect(priceOn([], "2026-01-01")).toBeNull();
  });
});

describe("nextPriceAfter", () => {
  it("finder den næste ændring", () => {
    expect(nextPriceAfter(prices, "2026-10-31")?.valid_from).toBe("2026-11-01");
  });
  it("ingen ændring efter den sidste", () => {
    expect(nextPriceAfter(prices, "2026-11-01")).toBeNull();
  });
});
