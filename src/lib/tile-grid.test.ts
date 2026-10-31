import { describe, expect, it } from "vitest";
import { tileGrid } from "./tile-grid";

describe("fliser der fylder skærmen", () => {
  it("plads til alle, uanset antal", () => {
    for (const n of [1, 3, 5, 8, 13, 24, 40, 75]) {
      const { cols, rows } = tileGrid(n, 1.3);
      expect(cols * rows).toBeGreaterThanOrEqual(n);
      expect(cols * rows - n).toBeLessThan(cols); // højst én række er ikke fyldt
    }
  });
  it("få fliser: én kolonne med brede fliser; mange: flere kolonner", () => {
    expect(tileGrid(3, 1.3).cols).toBe(1);
    expect(tileGrid(40, 1.3).cols).toBeGreaterThanOrEqual(3);
  });
  it("ingen fliser giver et tomt felt", () => {
    expect(tileGrid(0, 1.3)).toEqual({ cols: 1, rows: 1 });
  });
});
