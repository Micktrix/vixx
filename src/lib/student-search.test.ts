import { describe, expect, it } from "vitest";
import { matchesStudent } from "./student-search";

describe("matchesStudent", () => {
  const phone = "+4520456789";

  it("finder på dele af navnet, uanset store bogstaver og rækkefølge", () => {
    expect(matchesStudent("emil", "Emil Ærø", phone)).toBe(true);
    expect(matchesStudent("ærø em", "Emil Ærø", phone)).toBe(true);
    expect(matchesStudent("emil hansen", "Emil Ærø", phone)).toBe(false);
  });

  it("finder på telefonnummer med og uden mellemrum og +45", () => {
    expect(matchesStudent("20 45 67", "Emil", phone)).toBe(true);
    expect(matchesStudent("+4520456", "Emil", phone)).toBe(true);
    expect(matchesStudent("456789", "Emil", phone)).toBe(true);
    expect(matchesStudent("99 99", "Emil", phone)).toBe(false);
  });

  it("en tom søgning finder ingen", () => {
    expect(matchesStudent("  ", "Emil", phone)).toBe(false);
  });
});
