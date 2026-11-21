import { describe, expect, it } from "vitest";
import { facts, factText, type Appointment } from "./appointments";
import type { ModuleProgress } from "./module-progress";

const fmt = (iso: string) => iso;
const appt = (a: Partial<Appointment>): Appointment => ({
  id: Math.random().toString(),
  kind: "theory_test",
  on_date: "2026-11-01",
  at_time: null,
  address: null,
  status: "booked",
  created_at: "2026-10-01T00:00:00Z",
  ...a,
});
const mod = (m: Partial<ModuleProgress>) => ({ min_dark: 0, darkDone: false, drivenTopics: [], ...m }) as unknown as ModuleProgress;
const tone = (modules: ModuleProgress[], list: Appointment[], kind: string) => facts(modules, list).find((f) => f.kind === kind)!.tone;

describe("faktaboksen", () => {
  it("er grå uden aftaler og gul med en booket aftale", () => {
    expect(tone([], [], "theory_test")).toBe("none");
    expect(tone([], [appt({})], "theory_test")).toBe("booked");
  });

  it("ikke bestået er grå igen, ny dato gør den gul, bestået grøn", () => {
    const failed = appt({ status: "failed", on_date: "2026-11-01" });
    expect(tone([], [failed], "theory_test")).toBe("none");
    expect(factText(facts([], [failed])[2], fmt)).toBe("Ikke bestået 2026-11-01 – ny dato mangler");
    const again = appt({ on_date: "2026-11-20" });
    expect(tone([], [failed, again], "theory_test")).toBe("booked");
    expect(tone([], [failed, { ...again, status: "passed" }], "theory_test")).toBe("done");
  });

  it("KTA og mørke bliver grønne af sig selv ved scanning", () => {
    const scanned = [mod({ drivenTopics: ["9.1 Glat føre"] }), mod({ min_dark: 1, darkDone: true })];
    expect(tone(scanned, [], "kta")).toBe("done");
    expect(tone(scanned, [], "dark")).toBe("done");
    expect(tone([mod({ drivenTopics: ["7.4 Vognbaneskift"] })], [], "kta")).toBe("none");
  });

  it("KTA kan markeres gennemført manuelt", () => {
    expect(tone([], [appt({ kind: "kta", status: "passed" })], "kta")).toBe("done");
  });
});
