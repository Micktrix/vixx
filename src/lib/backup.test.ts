import { describe, expect, it } from "vitest";
import { backupCsv, backupFileName, backupRange, type BackupRow } from "./backup";

const row: BackupRow = {
  instructorName: "Lars Jensen",
  employeeNumber: "111",
  date: "2026-11-03",
  start: "08:00",
  minutes: 45,
  count: 3,
  serviceName: "Amu C",
  status: "approved",
  unitPriceOre: 27000,
};

describe("backup af timer", () => {
  it("dækker den igangværende og den forrige lønperiode", () => {
    expect(backupRange("2026-11-11", 21)).toEqual({ start: "2026-09-21", end: "2026-11-20" });
    expect(backupRange("2026-11-25", 21)).toEqual({ start: "2026-10-21", end: "2026-12-20" });
  });
  it("har én linje pr. registrering med status, sluttid og beløb", () => {
    const csv = backupCsv([row, { ...row, status: "pending", start: "12:00", count: 2, unitPriceOre: null }]);
    const lines = csv.replace("\uFEFF", "").trim().split("\r\n");
    expect(lines[0]).toBe("Lærer;Medarbejdernr;Dato;Start;Slut;Ydelse;Antal;Status;Sats;Beløb");
    expect(lines[1]).toBe("Lars Jensen;111;2026-11-03;08:00;10:15;Amu C;3;Godkendt;270,00;810,00");
    expect(lines[2]).toBe("Lars Jensen;111;2026-11-03;12:00;13:30;Amu C;2;Afventer;;");
  });
  it("starter med BOM, så Excel viser æøå", () => {
    expect(backupCsv([]).startsWith("\uFEFF")).toBe(true);
  });
  it("giver et sigende filnavn", () => {
    expect(backupFileName("Testkøreskolen ApS", "2026-11-11")).toBe("vixx-timer-testkøreskolen-aps-2026-11-11.csv");
  });
});
