import { describe, expect, it } from "vitest";
import { roleLabels, roleSetFromChoices } from "./roles";

describe("roleSetFromChoices", () => {
  it("kun lærer", () => {
    expect(roleSetFromChoices(["instructor"])).toEqual({ memberRole: "instructor", teaches: true });
  });
  it("kontor og lærer", () => {
    expect(roleSetFromChoices(["office", "instructor"])).toEqual({ memberRole: "office", teaches: true });
  });
  it("admin og kontor er admin", () => {
    expect(roleSetFromChoices(["admin", "office"])).toEqual({ memberRole: "admin", teaches: false });
  });
  it("alle tre", () => {
    expect(roleSetFromChoices(["admin", "office", "instructor"])).toEqual({ memberRole: "admin", teaches: true });
  });
  it("ingen roller er ikke gyldigt", () => {
    expect(roleSetFromChoices([])).toBeNull();
    expect(roleSetFromChoices(["platform_owner"])).toBeNull();
  });
});

describe("roleLabels", () => {
  it("viser rollerne i fast rækkefølge", () => {
    expect(roleLabels({ memberRole: "admin", teaches: true })).toEqual(["Admin", "Lærer"]);
    expect(roleLabels({ memberRole: "instructor", teaches: true })).toEqual(["Lærer"]);
    expect(roleLabels({ memberRole: "office", teaches: false })).toEqual(["Kontor"]);
  });
});
