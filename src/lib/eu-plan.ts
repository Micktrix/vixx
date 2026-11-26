import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { EU_SIGNOFF_FIELDS, EU_TOPIC_FIELDS, euProgress, type EuProgress, type EuSignoff, type EuTopic } from "@/lib/eu";
import { drawStrokes } from "@/lib/modulplan/fill";
import { formatPhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// EU-lektionsplanen som PDF (trin E9a): en kopi af skolens blanket (BEK 322/2020) i Vixx' eget layout. Vixx udfylder
// elev, skole, lærerliste, datoer, tid og lærernes underskrifter; eleven skriver under med kuglepen, og CPR skrives i
// hånden (gemmes ikke).

type Info = { heading: string; sub: string; minimum: string[]; driveIntro: string; driveNote: string; lastsikring: boolean };
const FULL_MIN = [
  "Intensiv grundlæggende kvalifikationsuddannelse: 148 timer herunder 10 individuelle køretimer og 11 timers undervisning i førstehjælp.",
  "Grundlæggende kvalifikationsuddannelse: 296 timer herunder 20 individuelle køretimer og 11 timers undervisning i førstehjælp.",
  "Der må i ingen af nævnte uddannelser ske en reduktion i antallet af timer på grundlag af en individuel kompetencevurdering.",
];
const FULL_DRIVES = "(Mindst 10/20 individuelle køretimer, heraf max. 4/8 timer på godkendt lukket øvelsesplads, godkendt køreteknisk anlæg eller avanceret simulator)";
const SHORT_DRIVES = "(Mindst 3 individuelle køretimer, heraf max. 2 på godkendt lukket øvelsesplads, godkendt køreteknisk anlæg eller avanceret simulator)";
const BUS_NOTE = "Mindst 2 af de individuelle køretimer skal foregå i en lang 3-akslet bus (minimum 13,5 m).";
export const EU_INFO: Record<string, Info> = {
  EU_GODS: {
    heading: "GRUNDLÆGGENDE KVALIFIKATIONSUDDANNELSE",
    sub: "Godstransport",
    minimum: FULL_MIN,
    driveIntro: FULL_DRIVES,
    driveNote: "De individuelle køretimer skal gennemføres med varierende belæsning fra 0 – 100% af teknisk tilladt totalvægt.",
    lastsikring: true,
  },
  EU_BUS: { heading: "GRUNDLÆGGENDE KVALIFIKATIONSUDDANNELSE", sub: "Personbefordring", minimum: FULL_MIN, driveIntro: FULL_DRIVES, driveNote: BUS_NOTE, lastsikring: false },
  EU_GODS3: {
    heading: "Godstransport for buschauffører",
    sub: "Godstransport",
    minimum: ["Godstransport for buschauffører: 37 timer herunder 3 individuelle køretimer."],
    driveIntro: SHORT_DRIVES,
    driveNote: BUS_NOTE,
    lastsikring: false,
  },
  EU_BUS3: {
    heading: "Personbefordring for lastbilchauffører",
    sub: "Personbefordring",
    minimum: ["Personbefordring for lastbilchauffører: 37 timer herunder 3 individuelle køretimer."],
    driveIntro: SHORT_DRIVES,
    driveNote: BUS_NOTE,
    lastsikring: false,
  },
};

type EuPlan = {
  kind: string;
  courseName: string;
  studentId: string;
  schoolId: string;
  student: { name: string; phone: string };
  school: { name: string; address: string; phone: string };
  teachers: { name: string; strokes: string | null }[];
  progress: EuProgress;
  strokes: Map<string, string | null>; // underskrift pr. bekræftelse
  passed: { lastsikring: string | null; multitest: string | null }; // beståede prøver (faktaboksen)
};

// Data til planen. RLS afgør, om brugeren kan se eleven; underskrifterne læses med service role.
export async function loadEuPlan(studentId: string): Promise<EuPlan | null> {
  const supabase = await createClient();
  const { data: s } = await supabase
    .from("students")
    .select("id, school_id, team_id, eu_course_id, profiles(full_name, phone), eu:courses!students_eu_course_fk(kind, name)")
    .eq("id", studentId)
    .maybeSingle();
  const euCourse = s?.eu as unknown as { kind: string; name: string } | null;
  const kind = euCourse?.kind;
  if (!s?.eu_course_id || !kind || !EU_INFO[kind]) return null;
  const [{ data: topics }, { data: signoffs }, { data: school }, { data: chosenRows }, { data: tests }] = await Promise.all([
    supabase.from("eu_topics").select(EU_TOPIC_FIELDS).eq("course_id", s.eu_course_id),
    supabase.from("eu_signoffs").select(`${EU_SIGNOFF_FIELDS}, instructor_id`).eq("student_id", studentId).order("signed_on"),
    supabase.from("schools").select("name, address, contact_phone").eq("id", s.school_id).single(),
    supabase
      .from("plan_teachers")
      .select("instructor_id, created_at")
      .or(s.team_id ? `team_id.eq.${s.team_id},student_id.eq.${s.id}` : `student_id.eq.${s.id}`)
      .order("created_at"),
    supabase.from("student_appointments").select("kind, on_date").eq("student_id", studentId).eq("status", "passed").in("kind", ["lastsikring", "multitest"]),
  ]);
  const passedOn = (k: string) => (tests ?? []).filter((t) => t.kind === k).map((t) => t.on_date as string).sort()[0] ?? null;
  const rows = (signoffs ?? []) as (EuSignoff & { instructor_id: string })[];
  const admin = createAdminClient();
  const { data: strokeRows } = await admin.from("eu_signoffs").select("id, strokes").in("id", rows.length ? rows.map((r) => r.id) : [randomUUID()]);
  // Lærerlisten: dem kontoret har valgt (undervisende kørelærere), så dem, der har bekræftet EU.
  const ids = [...new Set([...(chosenRows ?? []).map((r) => r.instructor_id as string), ...rows.map((r) => r.instructor_id)])];
  const { data: inst } = ids.length ? await admin.from("instructors").select("id, user_id").in("id", ids) : { data: [] };
  const userIds = (inst ?? []).map((i) => i.user_id as string);
  const [{ data: names }, { data: sigs }] = await Promise.all([
    admin.from("profiles").select("id, full_name").in("id", userIds.length ? userIds : [randomUUID()]),
    admin.from("instructor_signatures").select("user_id, strokes").eq("school_id", s.school_id).in("user_id", userIds.length ? userIds : [randomUUID()]),
  ]);
  const teachers = ids.flatMap((id) => {
    const userId = (inst ?? []).find((i) => i.id === id)?.user_id;
    if (!userId) return [];
    return [{ name: (names ?? []).find((p) => p.id === userId)?.full_name ?? "", strokes: (sigs ?? []).find((g) => g.user_id === userId)?.strokes ?? null }];
  });
  const profile = s.profiles as unknown as { full_name: string; phone: string } | null;
  return {
    kind,
    courseName: euCourse?.name ?? "EU",
    studentId: s.id,
    schoolId: s.school_id,
    student: { name: profile?.full_name ?? "", phone: profile?.phone ? formatPhone(profile.phone) : "" },
    school: { name: school?.name ?? "", address: school?.address ?? "", phone: school?.contact_phone ? formatPhone(school.contact_phone) : "" },
    teachers,
    progress: euProgress((topics ?? []) as EuTopic[], rows),
    strokes: new Map((strokeRows ?? []).map((r) => [r.id as string, r.strokes as string | null])),
    passed: { lastsikring: passedOn("lastsikring"), multitest: passedOn("multitest") },
  };
}

const date = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

// Tegner planen. A4, Helvetica (dækker æ, ø og å).
export async function renderEuPlan(plan: EuPlan): Promise<Uint8Array> {
  const info = EU_INFO[plan.kind];
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595;
  const H = 842;
  const M = 56;
  const ink = rgb(0.1, 0.1, 0.1);
  const line = rgb(0.25, 0.4, 0.7);
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const need = (h: number) => {
    if (y - h < M) newPage();
  };
  const wrap = (text: string, f: PDFFont, size: number, width: number) => {
    const out: string[] = [];
    for (const para of text.split("\n")) {
      let cur = "";
      for (const word of para.split(" ")) {
        const next = cur ? `${cur} ${word}` : word;
        if (f.widthOfTextAtSize(next, size) > width && cur) {
          out.push(cur);
          cur = word;
        } else cur = next;
      }
      out.push(cur);
    }
    return out;
  };
  const write = (text: string, opts: { f?: PDFFont; size?: number; x?: number; width?: number; gap?: number } = {}) => {
    const f = opts.f ?? font;
    const size = opts.size ?? 10;
    const x = opts.x ?? M;
    for (const l of wrap(text, f, size, opts.width ?? W - x - M)) {
      need(size + 3);
      page.drawText(l, { x, y: y - size, size, font: f, color: ink });
      y -= size + 3;
    }
    y -= opts.gap ?? 4;
  };
  const center = (text: string, f: PDFFont, size: number) => {
    page.drawText(text, { x: (W - f.widthOfTextAtSize(text, size)) / 2, y: y - size, size, font: f, color: ink });
    y -= size + 10;
  };
  const field = (label: string, value: string, x: number, width: number, labelW: number) => {
    page.drawText(label, { x, y: y - 10, size: 10, font, color: ink });
    page.drawText(value, { x: x + labelW + 4, y: y - 9, size: 10, font, color: ink });
    page.drawLine({ start: { x: x + labelW, y: y - 12 }, end: { x: x + width, y: y - 12 }, thickness: 0.6, color: line });
  };
  const signLine = (label: string, strokes: string | null | undefined, x: number) => {
    page.drawText(label, { x, y: y - 10, size: 10, font, color: ink });
    page.drawLine({ start: { x: x + 140, y: y - 12 }, end: { x: x + 340, y: y - 12 }, thickness: 0.6, color: line });
    if (strokes) drawStrokes(page, strokes, { x: x + 140, y: y - 14, width: 200, height: 26 });
    y -= 22;
  };

  // Forside
  const topicDates = plan.progress.topics.filter((t) => t.done).map((t) => t.done!.signed_on).sort();
  const allDone = plan.progress.topics.length > 0 && plan.progress.topics.every((t) => t.done);
  y -= 40;
  center("LEKTIONSPLAN", bold, 18);
  center("FOR", bold, 18);
  center(info.heading, bold, info.heading.length > 30 ? 15 : 13);
  y -= 16;
  write("Jf. bekendtgørelse nr. 322 af 30. marts 2020 om kvalifikationskrav til visse førere af køretøjer i vejtransport", { gap: 18 });
  for (const [i, label] of ["Intensiv grundlæggende kvalifikationsuddannelse", "Grundlæggende kvalifikationsuddannelse"].entries()) {
    const x = M + i * 250;
    page.drawRectangle({ x, y: y - 10, width: 9, height: 9, borderColor: ink, borderWidth: 0.7 });
    page.drawText(label, { x: x + 14, y: y - 9, size: 8.5, font, color: ink });
  }
  y -= 50;
  center(info.sub, bold, 18);
  y -= 20;
  field("Undervisningen påbegyndt:", topicDates[0] ? date(topicDates[0]) : "", M, 280, 130);
  field("-afsluttet:", allDone ? date(topicDates.at(-1)!) : "", M + 300, W - M - (M + 300), 50);
  y -= 44;
  page.drawText("Elev:", { x: M, y: y - 11, size: 11, font: bold, color: ink });
  page.drawText("Uddannelsescenter (stempel):", { x: M + 270, y: y - 11, size: 11, font: bold, color: ink });
  y -= 30;
  const schoolLines = [plan.school.name, ...plan.school.address.split(",").map((p) => p.trim()), plan.school.phone ? `Tlf: ${plan.school.phone}` : ""].filter(Boolean);
  const top = y;
  field("Navn:", plan.student.name, M, 240, 44);
  y -= 24;
  field("Cpr. nr.:", "", M, 240, 44);
  y -= 24;
  field("Tlf. nr.:", plan.student.phone, M, 240, 44);
  y = top;
  for (const l of schoolLines) {
    page.drawText(l, { x: M + 270, y: y - 11, size: 11, font, color: ink });
    y -= 20;
  }

  // Lærerne
  newPage();
  write("Undervisningen foretaget af følgende lærere:", { f: bold, size: 12, gap: 8 });
  page.drawText("Navn:", { x: M, y: y - 10, size: 10, font, color: ink });
  page.drawText("Underskrift:", { x: M + 250, y: y - 10, size: 10, font, color: ink });
  y -= 22;
  for (let i = 0; i < Math.max(10, plan.teachers.length); i++) {
    const t = plan.teachers[i];
    page.drawText(`${i + 1}.`, { x: M, y: y - 14, size: 11, font: bold, color: ink });
    if (t) page.drawText(t.name, { x: M + 22, y: y - 14, size: 11, font: bold, color: ink });
    page.drawLine({ start: { x: M + 20, y: y - 17 }, end: { x: W - M, y: y - 17 }, thickness: 1, color: ink });
    if (t?.strokes) drawStrokes(page, t.strokes, { x: M + 250, y: y - 18, width: 200, height: 24 });
    y -= 28;
  }

  // Oversigt
  y -= 20;
  write("Oversigt", { f: bold, size: 13, gap: 6 });
  write("Emne 1. Videreuddannelse i rationel kørsel med hovedvægt på sikkerhed", { gap: 1 });
  write("Emne 2. Anvendelse af reglerne", { gap: 1 });
  write("Emne 3. Sundhed, færdselssikkerhed og miljøsikkerhed, service og logistik", { gap: 10 });
  write("Undervisningen skal mindst omfatte:", { f: bold, gap: 4 });
  for (const m of info.minimum) write(m, { gap: 4 });
  write("Underviseren og chaufføren skal straks efter den gennemførte undervisning, i det efterfølgende med deres underskrift bekræfte det oplyste og angive den faktiske tidsanvendelse.", { gap: 4 });
  write("Al undervisning skal være gennemført inden den skriftlige prøve aflægges.", { gap: 4 });

  // Emnerne
  newPage();
  for (const t of plan.progress.topics) {
    const goalLines = wrap(`Mål: ${t.goal ?? ""}`, font, 9.5, W - 2 * M).length;
    const descLines = t.description ? wrap(t.description, font, 9.5, W - 2 * M - 20).length : 0;
    need(16 + (goalLines + descLines) * 12.5 + 100);
    write(`Emne ${t.code}`, { f: bold, size: 10.5, gap: 3 });
    write(`Mål: ${t.goal ?? ""}`, { size: 9.5, gap: 2 });
    if (t.description) write(t.description, { size: 9.5, x: M + 20, gap: 6 });
    field("Dato for undervisningens gennemførelse (sidste dag):", t.done ? date(t.done.signed_on) : "", M, 400, 250);
    y -= 20;
    field("Faktisk anvendt tid:", t.hours != null ? String(t.hours).replace(".", ",") : "", M, 300, 140);
    y -= 20;
    signLine("Underviserens underskrift:", t.done ? plan.strokes.get(t.done.id) : null, M);
    signLine("Chaufførens underskrift:", null, M);
    y -= 14;
  }
  const doneHours = plan.progress.hoursDone;
  need(120);
  y -= 6;
  field("Faktisk anvendt tid i alt:", allDone ? String(doneHours).replace(".", ",") : "", M, 300, 130);
  y -= 28;
  if (info.lastsikring) {
    field("Praktisk prøve i lastsikring bestået d.:", plan.passed.lastsikring ? date(plan.passed.lastsikring) : "", M, 340, 200);
    y -= 28;
  }
  field("Skriftlig prøve i Multitest bestået d.:", plan.passed.multitest ? date(plan.passed.multitest) : "", M, 340, 200);
  y -= 34;
  write("Lektionsplanen skal opbevares af uddannelsescentret i mindst 2 år efter afslutningen af kvalifikationsuddannelsen.", { f: bold, size: 10 });

  // Køretimerne
  newPage();
  write("Individuelle køretimer:", { f: bold, size: 11, gap: 3 });
  write(info.driveIntro, { size: 9.5, gap: 10 });
  const cols = [M, M + 62, M + 300, M + 370, W - M];
  const rowH = 36;
  const header = ["Dato", "Emne", "Timer", "Underskrift"];
  page.drawRectangle({ x: M, y: y - 18, width: W - 2 * M, height: 18, borderColor: ink, borderWidth: 0.6 });
  header.forEach((h, i) => page.drawText(h, { x: cols[i] + 4, y: y - 13, size: 9.5, font, color: ink }));
  y -= 18;
  const drives = [...plan.progress.drives];
  while (drives.length < 10) drives.push({ title: "", lessons: 0, done: null, topicId: null });
  for (const d of drives) {
    need(rowH + 30);
    page.drawRectangle({ x: M, y: y - rowH, width: W - 2 * M, height: rowH, borderColor: ink, borderWidth: 0.6 });
    for (const x of cols.slice(1, 4)) page.drawLine({ start: { x, y }, end: { x, y: y - rowH }, thickness: 0.6, color: ink });
    page.drawLine({ start: { x: cols[3], y: y - rowH / 2 }, end: { x: cols[4], y: y - rowH / 2 }, thickness: 0.6, color: ink });
    if (d.done) page.drawText(date(d.done.signed_on), { x: cols[0] + 3, y: y - 13, size: 8.5, font, color: ink });
    if (d.title) page.drawText(d.title.slice(0, 45), { x: cols[1] + 4, y: y - 13, size: 9, font, color: ink });
    if (d.lessons) page.drawText(`${d.lessons} x 45 min`, { x: cols[2] + 4, y: y - 13, size: 9, font, color: ink });
    page.drawText("Lærer:", { x: cols[3] + 3, y: y - 8, size: 6.5, font, color: ink });
    page.drawText("Elev:", { x: cols[3] + 3, y: y - rowH / 2 - 8, size: 6.5, font, color: ink });
    const s = d.done ? plan.strokes.get(d.done.id) : null;
    if (s) drawStrokes(page, s, { x: cols[3] + 22, y: y - rowH / 2, width: cols[4] - cols[3] - 26, height: rowH / 2 });
    y -= rowH;
  }
  y -= 12;
  write(info.driveNote, { size: 9.5 });

  return doc.save();
}

// Hver ny udgave af den printede EU-plan gemmes og slettes aldrig (som modulplanen): samme arkiv
// (`module_plan_versions`, lageret `module-plans`) med EU-forløbets navn som skabelon.
export async function archiveEuPlan(plan: EuPlan, pdf: Uint8Array, userId: string) {
  const content = { kind: plan.kind, student: plan.student, school: plan.school, teachers: plan.teachers, progress: plan.progress, passed: plan.passed };
  const hash = createHash("sha256").update(JSON.stringify(content)).digest("hex");
  const admin = createAdminClient();
  const { data: existing } = await admin.from("module_plan_versions").select("id").eq("student_id", plan.studentId).eq("content_hash", hash).maybeSingle();
  if (existing) return;
  const path = `${plan.schoolId}/${plan.studentId}/eu-${new Date().toISOString().replace(/[:.]/g, "-")}-${hash.slice(0, 8)}.pdf`;
  const { error } = await admin.storage.from("module-plans").upload(path, pdf, { contentType: "application/pdf" });
  if (error) return;
  await admin.from("module_plan_versions").insert({
    school_id: plan.schoolId,
    student_id: plan.studentId,
    template: plan.courseName.slice(0, 40),
    content_hash: hash,
    storage_path: path,
    created_by: userId,
  });
}
