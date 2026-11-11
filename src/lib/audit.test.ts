import { describe as group, expect, it } from "vitest";
import { describe, type Names } from "./audit";

const names: Names = {
  instructors: new Map([["i1", "Lars Jensen"]]),
  services: new Map([["s1", "Amu C"]]),
  other: new Map(),
};

group("ændringsloggen på dansk", () => {
  it("en rettelse viser gammel → ny med danske navne og formater", () => {
    const d = describe(
      {
        action: "update",
        table_name: "registrations",
        changes: {
          status: { old: "pending", new: "approved" },
          locked_unit_price_ore: { old: null, new: 27000 },
          decided_by: { old: null, new: "u1" },
        },
      },
      names,
    );
    expect(d.title).toBe("Rettede registrering");
    expect(d.details).toEqual(["status: afventer → godkendt", "låst sats: – → 270 kr."]);
  });

  it("en oprettelse viser de vigtige felter og slår navne op", () => {
    const d = describe(
      {
        action: "insert",
        table_name: "scheduled_lessons",
        changes: { id: "x", instructor_id: "i1", service_id: "s1", lesson_date: "2026-11-02", start_time: "08:00:00", lesson_count: 2, note: null },
      },
      names,
    );
    expect(d.title).toBe("Oprettede planlagt lektion");
    expect(d.details).toEqual(["underviser: Lars Jensen", "ydelse: Amu C", "dato: 2. nov. 2026", "start: 08:00", "antal: 2"]);
  });

  it("følsomme felter vises kun som ændret", () => {
    const d = describe({ action: "update", table_name: "instructors", changes: { email: "(ændret)" } }, names);
    expect(d.details).toEqual(["email: (ændret)"]);
  });

  it("timer med decimaler får komma", () => {
    const d = describe({ action: "insert", table_name: "absences", changes: { hours: 2.5, reason: "sick" } }, names);
    expect(d.details).toEqual(["timer: 2,5", "årsag: syg"]);
  });
});
