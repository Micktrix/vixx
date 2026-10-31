import { describe, expect, it } from "vitest";
import { exportLines, summarize, toDatalonCsv, type PayrollInstructor, type PayrollRegistration } from "./payroll";

// En testperiode, regnet i hånden:
// Lars: Amu C 3 lek. à 270 kr. (godkendt) + 2 lek. à 270 kr. (godkendt) = 5 × 270 = 1.350 kr.
//       Amu C 1 lek. à 280 kr. (godkendt efter prisændring) = 280 kr.
//       B privat 2 lek. à 220 kr. (godkendt) = 440 kr.            → i alt 8 lek., 2.070 kr.
//       Amu C 4 lek. afventer (tæller ikke), 2 lek. afvist (tæller ikke).
// Mette: B privat 1 lek. à 220 kr. = 220 kr.
// Bo (gæst): Amu C 2 lek. à 300 kr. = 600 kr. – med i overblikket, ikke i eksporten.
const instructors: PayrollInstructor[] = [
  { id: "lars", name: "Lars Jensen", employeeNumber: "111", isGuest: false },
  { id: "mette", name: "Mette Hansen", employeeNumber: "112", isGuest: false },
  { id: "bo", name: "Bo Rasmussen", employeeNumber: null, isGuest: true },
  { id: "pia", name: "Pia Andersen", employeeNumber: "114", isGuest: false },
];

const amuC = { serviceId: "amuc", serviceName: "Amu C", rateGroupId: "amu", rateGroupName: "Amu kørsel", payrollCode: "2101" };
const bPrivat = { serviceId: "bpriv", serviceName: "B privat", rateGroupId: "priv", rateGroupName: "Privatkørsel", payrollCode: "2104" };

const regs: PayrollRegistration[] = [
  { instructorId: "lars", status: "approved", count: 3, unitPriceOre: 27000, ...amuC },
  { instructorId: "lars", status: "approved", count: 2, unitPriceOre: 27000, ...amuC },
  { instructorId: "lars", status: "approved", count: 1, unitPriceOre: 28000, ...amuC },
  { instructorId: "lars", status: "approved", count: 2, unitPriceOre: 22000, ...bPrivat },
  { instructorId: "lars", status: "pending", count: 4, unitPriceOre: null, ...amuC },
  { instructorId: "lars", status: "rejected", count: 2, unitPriceOre: null, ...amuC },
  { instructorId: "mette", status: "approved", count: 1, unitPriceOre: 22000, ...bPrivat },
  { instructorId: "bo", status: "approved", count: 2, unitPriceOre: 30000, ...amuC },
];

describe("lønoverblik", () => {
  const summary = summarize(instructors, regs);
  const lars = summary.find((s) => s.instructor.id === "lars")!;

  it("tæller kun godkendte, med låst pris", () => {
    expect(lars.approvedCount).toBe(8);
    expect(lars.approvedOre).toBe(207000);
  });
  it("afventende vises for sig, afviste slet ikke", () => {
    expect(lars.pendingCount).toBe(4);
  });
  it("fordeler på satser", () => {
    expect(lars.byRateGroup.get("amu")).toEqual({ count: 6, ore: 163000 });
    expect(lars.byRateGroup.get("priv")).toEqual({ count: 2, ore: 44000 });
  });
  it("gæster er med i overblikket; lærere uden lektioner er ikke", () => {
    expect(summary.map((s) => s.instructor.id)).toEqual(["bo", "lars", "mette"]);
  });
});

describe("Dataløn-eksport", () => {
  const lines = exportLines(instructors, regs);

  it("én linje pr. lærer pr. ydelse og pris; gæster udelades", () => {
    expect(lines).toEqual([
      { employeeNumber: "111", name: "Lars Jensen", payrollCode: "2101", text: "Amu C", count: 5, unitOre: 27000, amountOre: 135000 },
      { employeeNumber: "111", name: "Lars Jensen", payrollCode: "2101", text: "Amu C", count: 1, unitOre: 28000, amountOre: 28000 },
      { employeeNumber: "111", name: "Lars Jensen", payrollCode: "2104", text: "B privat", count: 2, unitOre: 22000, amountOre: 44000 },
      { employeeNumber: "112", name: "Mette Hansen", payrollCode: "2104", text: "B privat", count: 1, unitOre: 22000, amountOre: 22000 },
    ]);
  });

  it("summen i eksporten svarer til de faste læreres godkendte løn", () => {
    expect(lines.reduce((n, l) => n + l.amountOre, 0)).toBe(207000 + 22000);
  });

  it("CSV med semikolon og dansk decimalkomma", () => {
    const csv = toDatalonCsv(lines.slice(0, 1));
    expect(csv).toBe("Medarbejdernr;Navn;Løndel;Tekst;Antal;Sats;Beløb\r\n111;Lars Jensen;2101;Amu C;5;270,00;1350,00\r\n");
  });

  it("tekst med semikolon sættes i anførselstegn", () => {
    const csv = toDatalonCsv([{ ...lines[0], text: 'Aften; "Amu"' }]);
    expect(csv).toContain(';"Aften; ""Amu""";');
  });
});
