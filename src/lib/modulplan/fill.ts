import "server-only";
import { PDFDocument, PDFName, PDFSignature, PDFTextField, rgb, type PDFField, type PDFPage } from "pdf-lib";

// Udfylder Færdselsstyrelsens udfyldbare modulplan (trin E8, del 6a).
// Felternes navne er forskellige fra plan til plan og har stavefejl ("CVRnpr", "udnerskrift"), og endelserne
// (_2, _3 …) passer ikke med modulerne. Felterne findes derfor ud fra den side, de står på:
//   - forsiden: "Elev", "Telefon", "Adresse"
//   - skolen: siden med "Navn" og "CVR…"; de fire øverste felter er navn, CVR-nr., adresse og telefon
//   - undervisende kørelærere: "Undervisende kørelærer_N" og signaturfeltet ud for det
//   - modul N: "Dato for opstart af modul N"; på siden med "Dato for afslutning af modul N" findes
//     ekstra teori/kørsel, selvstudie, "Overført", navn og signaturfeltet for den afsluttende kørelærer.
// Lærerskift, repetitionslektioner og manuelt gear udfyldes i hånden (del 5).

export type PlanData = {
  student: { name: string; phone: string; address: string };
  school: { name: string; cvr: string; address: string; phone: string };
  teachers: { name: string; strokes: string | null }[]; // i den rækkefølge, de første gang havde eleven
  modules: {
    number: number;
    startedOn: string | null; // ISO-dato
    completion: {
      completedOn: string;
      name: string;
      strokes: string | null; // null = gæstelærer (skriver under med kuglepen)
      extraTheory: number;
      extraDriving: number;
      selfStudy: string | null;
      transferred: boolean;
    } | null;
  }[];
};

type Placed = { field: PDFField; page: number; x: number; y: number; width: number; height: number };

// Datofelterne skal have formatet d/m/yy (Færdselsstyrelsens guide).
export function planDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}/${m}/${String(y).slice(-2)}`;
}

export async function fillModulePlan(template: Uint8Array, data: PlanData): Promise<Uint8Array> {
  const doc = await PDFDocument.load(template);
  const form = doc.getForm();
  const pages = doc.getPages();
  const placed: Placed[] = form.getFields().map((field) => {
    const widget = field.acroField.getWidgets()[0];
    const r = widget.getRectangle();
    const pageRef = widget.dict.get(PDFName.of("P"));
    return { field, page: pages.findIndex((p) => p.ref === pageRef), x: r.x, y: r.y, width: r.width, height: Math.abs(r.height) };
  });
  const named = (re: RegExp, page?: number) => placed.filter((p) => re.test(p.field.getName()) && (page === undefined || p.page === page));
  const text = (p: Placed | undefined, value: string) => {
    if (!p || !(p.field instanceof PDFTextField) || !value) return;
    p.field.setText(value);
  };
  const sign = (p: Placed | undefined, strokes: string | null) => {
    if (p && strokes) drawStrokes(pages[p.page], strokes, p);
  };

  // Forsiden.
  text(named(/^Elev$/)[0], data.student.name);
  text(named(/^Telefon$/)[0], data.student.phone);
  text(named(/^Adresse$/)[0], data.student.address);

  // Oplysninger om køreskole (den første blok; de to andre bruges ved skift af køreskole).
  const schoolPage = named(/^CVR/)[0]?.page;
  if (schoolPage !== undefined) {
    const [name, cvr, address, phone] = placed
      .filter((p) => p.page === schoolPage && p.field instanceof PDFTextField)
      .sort((a, b) => b.y - a.y);
    text(name, data.school.name);
    text(cvr, data.school.cvr);
    text(address, data.school.address);
    text(phone, data.school.phone);
  }

  // Undervisende kørelærere: navnefeltet og signaturfeltet ud for det (samme side, nærmeste højde).
  const teacherRows = named(/^Undervisende kørelærer/).sort((a, b) => a.page - b.page || b.y - a.y);
  data.teachers.slice(0, teacherRows.length).forEach((t, i) => {
    const row = teacherRows[i];
    text(row, t.name);
    const sig = placed
      .filter((p) => p.page === row.page && p.field instanceof PDFSignature)
      .sort((a, b) => Math.abs(a.y + a.height / 2 - (row.y + row.height / 2)) - Math.abs(b.y + b.height / 2 - (row.y + row.height / 2)))[0];
    sign(sig, t.strokes);
  });

  // Modulerne.
  for (const m of data.modules) {
    if (m.startedOn) text(named(new RegExp(`^Dato for opstart af modul ${m.number}$`))[0], planDate(m.startedOn));
    const c = m.completion;
    const end = named(new RegExp(`^Dato for afslutning af modul ${m.number}$`))[0];
    if (!c || !end) continue;
    const on = (re: RegExp) => named(re, end.page)[0];
    text(end, planDate(c.completedOn));
    text(on(/^Antal teoretiske lektioner anvendt/), String(c.extraTheory));
    text(on(/^Antal praktiske lektioner anvendt/), String(c.extraDriving));
    text(on(/^Antal lektioner og emner/), c.selfStudy ?? "");
    text(on(/^Overført fra lektionsplan/), c.transferred ? "X" : "");
    text(on(/^Afsluttende kørerlærers for- og efternavn/), c.name);
    sign(placed.find((p) => p.page === end.page && p.field instanceof PDFSignature), c.strokes);
  }

  // Signaturfelterne er digitale signaturfelter; underskrifterne er tegnet på siden. Formularen låses
  // (flades ud), så den udskrevne og gemte udgave ikke kan rettes.
  for (const p of placed) if (p.field instanceof PDFSignature) form.removeField(p.field);
  form.flatten();
  return doc.save();
}

// Tegner underskriften (stregdata "M x y L x y …" fra et felt på 600 × 200) ind i feltets rektangel.
function drawStrokes(page: PDFPage, strokes: string, box: { x: number; y: number; width: number; height: number }) {
  const nums = strokes.match(/-?[0-9.]+/g)?.map(Number) ?? [];
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  if (!xs.length) return;
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = 4;
  const scale = Math.min((box.width - 2 * pad) / Math.max(maxX - minX, 1), (box.height - 2 * pad) / Math.max(maxY - minY, 1));
  const w = (maxX - minX) * scale;
  const h = (maxY - minY) * scale;
  // drawSvgPath bruger SVG-koordinater (y nedad) med (x, y) som stiens øverste venstre hjørne.
  page.drawSvgPath(strokes, {
    x: box.x + (box.width - w) / 2 - minX * scale,
    y: box.y + (box.height + h) / 2 + minY * scale,
    scale,
    borderColor: rgb(0.08, 0.1, 0.35),
    borderWidth: 1.4 / scale,
  });
}
