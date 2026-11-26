import "server-only";
import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import { detectFieldMap, placeFields, type FieldMap } from "./field-map";

// Udfylder Færdselsstyrelsens udfyldbare modulplan (trin E8, del 6a) efter feltkortet (del 6c-1). Uden kort
// genkender Vixx felterne selv (se field-map.ts). Lærerskift og skift af køreskole udfyldes i hånden.

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
      manualGear: number | null; // null = eleven er ikke i forsøgsordningen (kode 78)
    } | null;
  }[];
  repetitions: { date: string; count: number; strokes: string | null }[];
};

// Datofelterne skal have formatet d/m/yy (Færdselsstyrelsens guide).
export function planDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}/${m}/${String(y).slice(-2)}`;
}

export async function fillModulePlan(template: Uint8Array, data: PlanData, fieldMap?: FieldMap | null): Promise<Uint8Array> {
  const doc = await PDFDocument.load(template);
  const form = doc.getForm();
  const pages = doc.getPages();
  const placed = placeFields(doc);
  const map = fieldMap ?? detectFieldMap(doc);
  const byName = new Map(placed.map((p) => [p.name, p]));

  const text = (name: string | undefined, value: string) => {
    const p = name ? byName.get(name) : undefined;
    if (p?.kind === "text" && value) form.getTextField(p.name).setText(value);
  };
  const sign = (name: string | undefined, strokes: string | null) => {
    const p = name ? byName.get(name) : undefined;
    if (p && strokes) drawStrokes(pages[p.page], strokes, p);
  };

  text(map.student.name, data.student.name);
  text(map.student.phone, data.student.phone);
  text(map.student.address, data.student.address);
  text(map.school.name, data.school.name);
  text(map.school.cvr, data.school.cvr);
  text(map.school.address, data.school.address);
  text(map.school.phone, data.school.phone);

  data.teachers.slice(0, map.teachers.length).forEach((t, i) => {
    text(map.teachers[i].name, t.name);
    sign(map.teachers[i].signature, t.strokes);
  });

  for (const m of data.modules) {
    const f = map.modules[String(m.number)];
    if (!f) continue;
    if (m.startedOn) text(f.start, planDate(m.startedOn));
    const c = m.completion;
    if (!c) continue;
    text(f.end, planDate(c.completedOn));
    text(f.extraTheory, String(c.extraTheory));
    text(f.extraDriving, String(c.extraDriving));
    text(f.selfStudy, c.selfStudy ?? "");
    text(f.transferred, c.transferred ? "X" : "");
    if (c.manualGear !== null) text(f.manualGear, String(c.manualGear));
    text(f.name, c.name);
    sign(f.signature, c.strokes);
  }

  // Repetitionslektioner efter ikke bestået praktisk prøve.
  data.repetitions.slice(0, map.repetitions.length).forEach((r, i) => {
    text(map.repetitions[i].date, planDate(r.date));
    text(map.repetitions[i].count, String(r.count));
    sign(map.repetitions[i].signature, r.strokes);
  });

  // Signaturfelterne er digitale signaturfelter; underskrifterne er tegnet på siden. Formularen låses
  // (flades ud), så den udskrevne og gemte udgave ikke kan rettes.
  for (const p of placed) if (p.kind === "signature") form.removeField(p.field);
  form.flatten();
  return doc.save();
}

// Tegner underskriften (stregdata "M x y L x y …" fra et felt på 600 × 200) ind i feltets rektangel.
export function drawStrokes(page: PDFPage, strokes: string, box: { x: number; y: number; width: number; height: number }) {
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
