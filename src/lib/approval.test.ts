import { describe, expect, it } from "vitest";
import { flagFor } from "./approval";

describe("kontrol mod skemaet", () => {
  it("uden planlagt lektion er den uplanlagt", () => {
    expect(flagFor({ serviceId: "a", count: 2 }, null)).toBe("uplanlagt");
  });
  it("samme ydelse og antal matcher", () => {
    expect(flagFor({ serviceId: "a", count: 2 }, { serviceId: "a", count: 2 })).toBe("matcher");
  });
  it("andet antal eller anden ydelse afviger", () => {
    expect(flagFor({ serviceId: "a", count: 3 }, { serviceId: "a", count: 4 })).toBe("afvigelse");
    expect(flagFor({ serviceId: "b", count: 2 }, { serviceId: "a", count: 2 })).toBe("afvigelse");
  });
});
