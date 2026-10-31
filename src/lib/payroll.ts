// Lønberegning for en periode. Kun godkendte registreringer tæller, med den pris der blev låst ved
// godkendelsen. Afventende vises for sig og tæller ikke. Afviste tæller slet ikke.

export type PayrollRegistration = {
  instructorId: string;
  status: "pending" | "approved" | "rejected";
  count: number;
  unitPriceOre: number | null; // låst pris for godkendte
  serviceId: string;
  serviceName: string;
  rateGroupId: string;
  rateGroupName: string;
  payrollCode: string | null;
};

export type PayrollInstructor = { id: string; name: string; employeeNumber: string | null; isGuest: boolean };

export type InstructorSummary = {
  instructor: PayrollInstructor;
  approvedCount: number;
  approvedOre: number;
  pendingCount: number;
  byRateGroup: Map<string, { count: number; ore: number }>;
};

export function summarize(instructors: PayrollInstructor[], registrations: PayrollRegistration[]): InstructorSummary[] {
  return instructors
    .map((instructor) => {
      const mine = registrations.filter((r) => r.instructorId === instructor.id);
      const byRateGroup = new Map<string, { count: number; ore: number }>();
      let approvedCount = 0;
      let approvedOre = 0;
      for (const r of mine.filter((r) => r.status === "approved")) {
        const amount = r.count * (r.unitPriceOre ?? 0);
        approvedCount += r.count;
        approvedOre += amount;
        const g = byRateGroup.get(r.rateGroupId) ?? { count: 0, ore: 0 };
        byRateGroup.set(r.rateGroupId, { count: g.count + r.count, ore: g.ore + amount });
      }
      const pendingCount = mine.filter((r) => r.status === "pending").reduce((n, r) => n + r.count, 0);
      return { instructor, approvedCount, approvedOre, pendingCount, byRateGroup };
    })
    .filter((s) => s.approvedCount || s.pendingCount)
    .sort((a, b) => a.instructor.name.localeCompare(b.instructor.name, "da"));
}

// Én linje pr. lærer pr. ydelse (og pr. pris, hvis prisen har skiftet i perioden). Gæster er ikke med;
// de afregnes via faktura.
export type ExportLine = {
  employeeNumber: string;
  name: string;
  payrollCode: string;
  text: string;
  count: number;
  unitOre: number;
  amountOre: number;
};

export function exportLines(instructors: PayrollInstructor[], registrations: PayrollRegistration[]): ExportLine[] {
  const byId = new Map(instructors.map((i) => [i.id, i]));
  const lines = new Map<string, ExportLine>();
  for (const r of registrations) {
    const instructor = byId.get(r.instructorId);
    if (r.status !== "approved" || !instructor || instructor.isGuest) continue;
    const unit = r.unitPriceOre ?? 0;
    const key = `${r.instructorId}|${r.serviceId}|${unit}`;
    const line = lines.get(key) ?? {
      employeeNumber: instructor.employeeNumber ?? "",
      name: instructor.name,
      payrollCode: r.payrollCode ?? "",
      text: r.serviceName,
      count: 0,
      unitOre: unit,
      amountOre: 0,
    };
    line.count += r.count;
    line.amountOre += r.count * unit;
    lines.set(key, line);
  }
  return [...lines.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "da") || a.text.localeCompare(b.text, "da") || a.unitOre - b.unitOre,
  );
}

// Kolonnerne i Dataløn-filen. Samlet her, så formatet let kan tilpasses skolens importfil.
export const DATALON_COLUMNS: { header: string; value: (l: ExportLine) => string }[] = [
  { header: "Medarbejdernr", value: (l) => l.employeeNumber },
  { header: "Navn", value: (l) => l.name },
  { header: "Løndel", value: (l) => l.payrollCode },
  { header: "Tekst", value: (l) => l.text },
  { header: "Antal", value: (l) => String(l.count) },
  { header: "Sats", value: (l) => decimal(l.unitOre) },
  { header: "Beløb", value: (l) => decimal(l.amountOre) },
];

// Dansk decimaltal uden tusindtalsskilletegn: 27000 øre → "270,00".
export const decimal = (ore: number) => (ore / 100).toFixed(2).replace(".", ",");

const cell = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toDatalonCsv(lines: ExportLine[]): string {
  const rows = [DATALON_COLUMNS.map((c) => c.header), ...lines.map((l) => DATALON_COLUMNS.map((c) => c.value(l)))];
  return rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}
