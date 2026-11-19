import "server-only";
import { PDFName, PDFSignature, PDFTextField, type PDFDocument, type PDFField } from "pdf-lib";

// Feltkort for Færdselsstyrelsens modulplan: hvilket felt i PDF'en hver oplysning skal i (trin E8, del 6c-1).
// Felternes navne er forskellige fra plan til plan og har stavefejl ("CVRnpr", "udnerskrift"), og endelserne
// (_2, _3 …) passer ikke med modulerne. Vixx genkender derfor felterne ud fra den side, de står på:
//   - forsiden: "Elev", "Telefon", "Adresse"
//   - skolen: siden med "CVR…"; de fire øverste felter er navn, CVR-nr., adresse og telefon
//   - undervisende kørelærere: "Undervisende kørelærer_N" og signaturfeltet ud for det
//   - modul N: "Dato for opstart af modul N"; på siden med "Dato for afslutning af modul N" findes ekstra
//     teori/kørsel, selvstudie, "Overført", manuelt gear, navn og signaturfeltet for den afsluttende kørelærer
//   - repetitionslektioner: "Dato_…", "Antal lektioner_…" og signaturfeltet ud for dem
// Lærerskift og skift af køreskole udfyldes i hånden (aftalt med Michael 19. nov. 2026).
// Admin kan rette kortet for en opsendt version, hvis et felt ikke blev genkendt.

export type ModuleFields = {
  start?: string;
  end?: string;
  extraTheory?: string;
  extraDriving?: string;
  selfStudy?: string;
  transferred?: string;
  manualGear?: string;
  name?: string;
  signature?: string;
};

export type FieldMap = {
  student: { name?: string; phone?: string; address?: string };
  school: { name?: string; cvr?: string; address?: string; phone?: string };
  teachers: { name: string; signature?: string }[];
  modules: Record<string, ModuleFields>;
  repetitions: { date: string; count?: string; signature?: string }[];
};

export type PlacedField = { field: PDFField; name: string; kind: "text" | "signature" | "other"; page: number; x: number; y: number; width: number; height: number };

export function placeFields(doc: PDFDocument): PlacedField[] {
  const pages = doc.getPages();
  return doc
    .getForm()
    .getFields()
    .map((field) => {
      const widget = field.acroField.getWidgets()[0];
      const r = widget.getRectangle();
      const pageRef = widget.dict.get(PDFName.of("P"));
      // Enkelte felter har negativ højde (fx "Antal lektioner_1.0" i B); rektanglet vendes, så y er bunden.
      const y = r.height < 0 ? r.y + r.height : r.y;
      const kind = field instanceof PDFTextField ? "text" : field instanceof PDFSignature ? "signature" : "other";
      return { field, name: field.getName(), kind, page: pages.findIndex((p) => p.ref === pageRef), x: r.x, y, width: r.width, height: Math.abs(r.height) };
    });
}

// Signaturfeltet på samme side, der står nærmest i højden.
export function signatureBeside(placed: PlacedField[], row: PlacedField) {
  const mid = (p: PlacedField) => p.y + p.height / 2;
  return placed.filter((p) => p.page === row.page && p.kind === "signature").sort((a, b) => Math.abs(mid(a) - mid(row)) - Math.abs(mid(b) - mid(row)))[0];
}

export function detectFieldMap(doc: PDFDocument): FieldMap {
  const placed = placeFields(doc);
  const named = (re: RegExp, page?: number) => placed.filter((p) => re.test(p.name) && (page === undefined || p.page === page));
  const first = (re: RegExp, page?: number) => named(re, page)[0]?.name;

  const map: FieldMap = { student: {}, school: {}, teachers: [], modules: {}, repetitions: [] };
  map.student = { name: first(/^Elev$/), phone: first(/^Telefon$/), address: first(/^Adresse$/) };

  // Oplysninger om køreskole (den første blok; de to andre bruges ved skift af køreskole).
  const schoolPage = named(/^CVR/)[0]?.page;
  if (schoolPage !== undefined) {
    const [name, cvr, address, phone] = placed.filter((p) => p.page === schoolPage && p.kind === "text").sort((a, b) => b.y - a.y);
    map.school = { name: name?.name, cvr: cvr?.name, address: address?.name, phone: phone?.name };
  }

  map.teachers = named(/^Undervisende kørelærer/)
    .sort((a, b) => a.page - b.page || b.y - a.y)
    .map((row) => ({ name: row.name, signature: signatureBeside(placed, row)?.name }));

  for (const end of named(/^Dato for afslutning af modul \d+$/)) {
    const n = end.name.match(/(\d+)$/)![1];
    const on = (re: RegExp) => first(re, end.page);
    map.modules[n] = {
      start: first(new RegExp(`^Dato for opstart af modul ${n}$`)),
      end: end.name,
      extraTheory: on(/^Antal teoretiske lektioner anvendt/),
      extraDriving: on(/^Antal praktiske lektioner anvendt/),
      selfStudy: on(/^Antal lektioner og emner/),
      transferred: on(/^Overført fra lektionsplan/),
      manualGear: on(/^Antal praktiske lektioner gennemført i køretøj med manuelt gear/),
      name: on(/^Afsluttende kørerlærers for- og efternavn/),
      signature: placed.find((p) => p.page === end.page && p.kind === "signature")?.name,
    };
  }

  map.repetitions = named(/^Dato_/)
    .sort((a, b) => a.page - b.page || b.y - a.y)
    .map((row) => ({
      date: row.name,
      count: named(/^Antal lektioner_/, row.page).sort((a, b) => Math.abs(a.y - row.y) - Math.abs(b.y - row.y))[0]?.name,
      signature: signatureBeside(placed, row)?.name,
    }));
  return map;
}

// Det, der skal være på plads, før en opsendt version kan tages i brug: elevens og skolens navn, og for hvert
// af forløbets moduler afslutningsdato, lærerens navn og underskrift.
export function missingFields(map: FieldMap, moduleNumbers: number[]): string[] {
  const missing: string[] = [];
  if (!map.student.name) missing.push("Elevens navn");
  if (!map.school.name) missing.push("Skolens navn");
  for (const n of moduleNumbers) {
    const m = map.modules[String(n)] ?? {};
    if (!m.end) missing.push(`Dato for afslutning af modul ${n}`);
    if (!m.name) missing.push(`Afsluttende kørelærers navn, modul ${n}`);
    if (!m.signature) missing.push(`Afsluttende kørelærers underskrift, modul ${n}`);
  }
  return missing;
}
