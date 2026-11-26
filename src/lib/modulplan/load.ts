import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { todayDk } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FieldMap } from "./field-map";
import { fillModulePlan, type PlanData } from "./fill";

// Henter alt til elevens modulplan og udfylder Færdselsstyrelsens PDF (trin E8, del 6a).
// Adgangen tjekkes med brugerens egen forbindelse (RLS): kan brugeren ikke se eleven, findes planen ikke.
// Kopierne af underskrifterne kan ikke læses via appen; dem henter serveren bagefter med service role.
// Eleven har sin egen version af PDF'en (del 6c-1): den indbyggede 1.1 eller en, admin har lagt op.

const BUCKET = "module-plans";
export const TEMPLATE_BUCKET = "module-plan-templates";

export type PlanTemplate = { id: string; version: string; builtin: string | null; storage_path: string | null; field_map: FieldMap | null };

// PDF'en for en version: indbygget (ligger i Vixx) eller opsendt (Storage, kun serveren).
export async function readTemplatePdf(t: Pick<PlanTemplate, "builtin" | "storage_path">): Promise<Uint8Array | null> {
  if (t.builtin) return new Uint8Array(await readFile(path.join(process.cwd(), "src/lib/modulplan/templates", `${t.builtin}.pdf`)));
  if (!t.storage_path) return null;
  const { data } = await createAdminClient().storage.from(TEMPLATE_BUCKET).download(t.storage_path);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

type StudentRow = {
  id: string;
  school_id: string;
  address: string | null;
  manual_gear: boolean;
  plan_template_id: string | null;
  team_id: string | null;
  created_at: string;
  course_start_on: string | null;
  teams: { starts_on: string | null } | null;
  profiles: { full_name: string; phone: string } | null;
  courses: { name: string; category_code: string; plan_kind: string; course_modules: { id: string; number: number }[] } | null;
  module_signoffs: { course_module_id: string; lesson_date: string; kind: string; lesson_count: number; manual_gear: boolean }[];
  repetition_lessons: { id: string; lesson_date: string; lesson_count: number }[];
  module_completions: {
    id: string;
    course_module_id: string;
    completed_on: string;
    started_on: string | null;
    instructor_name: string;
    extra_theory: number;
    extra_driving: number;
    self_study: string | null;
    transferred: boolean;
    annulled_at: string | null;
  }[];
  module_plan_teachers: { id: string; instructor_id: string | null; instructor_name: string; first_on: string }[];
};

export async function loadModulePlan(studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select(
      "id, school_id, address, manual_gear, plan_template_id, team_id, created_at, course_start_on, teams(starts_on), profiles(full_name, phone), courses!students_school_id_course_id_fkey(name, category_code, plan_kind, course_modules(id, number)), module_signoffs(course_module_id, lesson_date, kind, lesson_count, manual_gear), repetition_lessons(id, lesson_date, lesson_count), module_completions(id, course_module_id, completed_on, started_on, instructor_name, extra_theory, extra_driving, self_study, transferred, annulled_at), module_plan_teachers(id, instructor_id, instructor_name, first_on)",
    )
    .eq("id", studentId)
    .maybeSingle();
  const student = data as unknown as StudentRow | null;
  const course = student?.courses;
  if (!student || course?.plan_kind !== "modules" || !student.plan_template_id) return null;
  const { data: tpl } = await supabase
    .from("module_plan_templates")
    .select("id, version, builtin, storage_path, field_map")
    .eq("id", student.plan_template_id)
    .maybeSingle();
  if (!tpl) return null;
  const template = tpl as PlanTemplate;

  const { data: school } = await supabase.from("schools").select("name, cvr, address, contact_phone").eq("id", student.school_id).single();

  // Underskrifterne (service role).
  const admin = createAdminClient();
  const completions = student.module_completions.filter((c) => !c.annulled_at);
  // Undervisende kørelærere: først dem, kontoret har valgt (på holdet eller eleven), så dem, der har haft eleven.
  const { data: chosenRows } = await supabase
    .from("plan_teachers")
    .select("instructor_id, created_at")
    .or(student.team_id ? `team_id.eq.${student.team_id},student_id.eq.${student.id}` : `student_id.eq.${student.id}`)
    .order("created_at");
  const chosenIds = [...new Set((chosenRows ?? []).map((t) => t.instructor_id as string))];
  const autoRows = [...student.module_plan_teachers].sort((a, b) => a.first_on.localeCompare(b.first_on));
  const teacherRows = autoRows;
  const repetitions = [...student.repetition_lessons].sort((a, b) => a.lesson_date.localeCompare(b.lesson_date));
  const [{ data: completionStrokes }, { data: teacherStrokes }, { data: repetitionStrokes }] = await Promise.all([
    admin.from("module_completions").select("id, strokes").in("id", completions.length ? completions.map((c) => c.id) : [randomUUID()]),
    admin.from("module_plan_teachers").select("id, strokes").in("id", teacherRows.length ? teacherRows.map((t) => t.id) : [randomUUID()]),
    admin.from("repetition_lessons").select("id, strokes").in("id", repetitions.length ? repetitions.map((r) => r.id) : [randomUUID()]),
  ]);
  const strokesOf = (rows: { id: string; strokes: string | null }[] | null, id: string) => rows?.find((r) => r.id === id)?.strokes ?? null;
  // De valgte læreres navn og gemte underskrift (service role; underskriften kommer på, når læreren har gemt den).
  const { data: chosenInfo } = chosenIds.length ? await admin.from("instructors").select("id, user_id").in("id", chosenIds) : { data: [] };
  const userIds = (chosenInfo ?? []).map((i) => i.user_id as string);
  const [{ data: chosenNames }, { data: chosenSigs }] = await Promise.all([
    admin.from("profiles").select("id, full_name").in("id", userIds.length ? userIds : [randomUUID()]),
    admin.from("instructor_signatures").select("user_id, strokes").eq("school_id", student.school_id).in("user_id", userIds.length ? userIds : [randomUUID()]),
  ]);
  const chosen = chosenIds.flatMap((id) => {
    const userId = (chosenInfo ?? []).find((x) => x.id === id)?.user_id;
    if (!userId) return [];
    const name = (chosenNames ?? []).find((p) => p.id === userId)?.full_name ?? "";
    return [{ id, name, strokes: (chosenSigs ?? []).find((g) => g.user_id === userId)?.strokes ?? null }];
  });
  // Start af modul 1: elevens egen dato, ellers holdets startdato, ellers oprettelsesdatoen.
  const courseStart = student.course_start_on ?? student.teams?.starts_on ?? todayDk(new Date(student.created_at));
  const firstNumber = Math.min(...course.course_modules.map((m) => m.number));

  const plan: PlanData = {
    student: {
      name: student.profiles?.full_name ?? "",
      phone: student.profiles?.phone ? formatPhone(student.profiles.phone) : "",
      address: student.address ?? "",
    },
    school: {
      name: school?.name ?? "",
      cvr: school?.cvr ?? "",
      address: school?.address ?? "",
      phone: school?.contact_phone ? formatPhone(school.contact_phone) : "",
    },
    teachers: [
      ...chosen.map((t) => ({ name: t.name, strokes: t.strokes })),
      ...teacherRows
        .filter((t) => !chosen.some((c) => c.id === t.instructor_id))
        .map((t) => ({ name: t.instructor_name, strokes: strokesOf(teacherStrokes, t.id) })),
    ],
    modules: [...course.course_modules]
      .sort((a, b) => a.number - b.number)
      .map((m) => {
        const c = completions.find((x) => x.course_module_id === m.id);
        return {
          number: m.number,
          startedOn:
            c?.started_on ??
            (m.number === firstNumber
              ? courseStart
              : (student.module_signoffs.filter((s) => s.course_module_id === m.id).map((s) => s.lesson_date).sort()[0] ?? null)),
          completion: c
            ? {
                completedOn: c.completed_on,
                name: c.instructor_name,
                strokes: strokesOf(completionStrokes, c.id),
                extraTheory: c.extra_theory,
                extraDriving: c.extra_driving,
                selfStudy: c.self_study,
                transferred: c.transferred,
                // Kode 78 (kun B): kørsel i manuelt gear i modulet.
                manualGear:
                  student.manual_gear && course.category_code === "B"
                    ? student.module_signoffs
                        .filter((s) => s.course_module_id === m.id && s.kind === "driving" && s.manual_gear)
                        .reduce((n, s) => n + s.lesson_count, 0)
                    : null,
              }
            : null,
      };
      }),
    repetitions: repetitions.map((r) => ({ date: r.lesson_date, count: r.lesson_count, strokes: strokesOf(repetitionStrokes, r.id) })),
  };
  return { studentId: student.id, schoolId: student.school_id, template, label: template.builtin ?? `${course.name} ${template.version}`, plan };
}

// Udfyld PDF'en. Er indholdet nyt, gemmes udgaven (den overskrives og slettes aldrig).
export async function buildModulePlan(studentId: string, userId: string) {
  const loaded = await loadModulePlan(studentId);
  if (!loaded) return null;
  const file = await readTemplatePdf(loaded.template);
  if (!file) return null;
  const pdf = await fillModulePlan(file, loaded.plan, loaded.template.field_map);

  const hash = createHash("sha256").update(JSON.stringify({ template: loaded.template.id, plan: loaded.plan })).digest("hex");
  const admin = createAdminClient();
  const { data: existing } = await admin.from("module_plan_versions").select("id").eq("student_id", studentId).eq("content_hash", hash).maybeSingle();
  if (!existing) {
    const storagePath = `${loaded.schoolId}/${studentId}/${new Date().toISOString().replace(/[:.]/g, "-")}-${hash.slice(0, 8)}.pdf`;
    const { error } = await admin.storage.from(BUCKET).upload(storagePath, pdf, { contentType: "application/pdf" });
    if (!error) {
      await admin.from("module_plan_versions").insert({
        school_id: loaded.schoolId,
        student_id: studentId,
        template: loaded.label.slice(0, 40),
        template_id: loaded.template.id,
        content_hash: hash,
        storage_path: storagePath,
        created_by: userId,
      });
    }
  }
  return { pdf, name: loaded.plan.student.name };
}

// Prøvetryk af en version med testdata (kun admin; tjekkes af den, der kalder). Gemmes ikke.
export async function buildTestPrint(template: PlanTemplate, moduleNumbers: number[], fieldMap?: FieldMap | null) {
  const file = await readTemplatePdf(template);
  if (!file) return null;
  const sig = "M 40 140 L 70 60 L 100 140 L 130 80 L 160 130 L 200 70 L 230 120 L 260 90 L 300 130 L 340 80 L 380 120 L 420 100 L 480 110";
  const plan: PlanData = {
    student: { name: "Test Elev", phone: "12 34 56 78", address: "Prøvevej 1, 1234 Testby" },
    school: { name: "Testkøreskole", cvr: "12345678", address: "Skolevej 1, 1234 Testby", phone: "87 65 43 21" },
    teachers: [
      { name: "Test Lærer 1", strokes: sig },
      { name: "Test Lærer 2", strokes: sig },
    ],
    modules: moduleNumbers.map((n, i) => ({
      number: n,
      startedOn: `2026-01-${String(2 + i * 3).padStart(2, "0")}`,
      completion: {
        completedOn: `2026-01-${String(4 + i * 3).padStart(2, "0")}`,
        name: "Test Lærer 1",
        strokes: sig,
        extraTheory: 1,
        extraDriving: 2,
        selfStudy: "1 lektion (prøve)",
        transferred: i === 0,
        manualGear: 3,
      },
    })),
    repetitions: [{ date: "2026-02-01", count: 2, strokes: sig }],
  };
  return fillModulePlan(file, plan, fieldMap ?? template.field_map);
}
