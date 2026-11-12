import Link from "next/link";
import { notFound } from "next/navigation";
import { Box } from "@/components/box";
import { ActionForm, TextField } from "@/components/form";
import { Pill } from "@/components/pill";
import { inputClass } from "@/components/styles";
import { requireRole } from "@/lib/auth/session";
import { COURSE_TEMPLATES } from "@/lib/course-templates";
import { createClient } from "@/lib/supabase/server";
import { addLesson, deleteCourse, deleteLesson, insertTemplate, moveLesson, updateCourse, updateLesson } from "../actions";
import { LessonFields, type LessonRow } from "../lesson-fields";

const KIND = { driving: "Kørsel", theory: "Teori" } as const;

// Ét forløb: lektionerne i rækkefølge, som på lektionsplanen. Admin retter; kontoret kan se.
export default async function CoursePage({ params }: PageProps<"/kontor/forloeb/[id]">) {
  const { id } = await params;
  const { membership } = await requireRole(["admin", "office"]);
  const isAdmin = membership.role === "admin";
  const supabase = await createClient();
  const [{ data: course }, { data: lessonData }, { data: categories }] = await Promise.all([
    supabase.from("courses").select("id, name, category_code, theory_lessons, active").eq("id", id).eq("school_id", membership.schoolId).maybeSingle(),
    supabase
      .from("course_lessons")
      .select("id, number, kind, lesson_count, location, content, notes, control_topic, active")
      .eq("course_id", id)
      .order("sort_order"),
    supabase.from("license_categories").select("code").order("sort_order"),
  ]);
  if (!course) notFound();
  const lessons = (lessonData ?? []) as LessonRow[];
  const active = lessons.filter((l) => l.active);
  const templates = COURSE_TEMPLATES.filter((t) => t.category === course.category_code);

  return (
    <>
      <header className="flex flex-col gap-1">
        <Link href="/kontor/forloeb" className="text-sm font-semibold text-muted hover:text-ink">
          ‹ Forløb
        </Link>
        <h1 className="text-[30px] font-bold">{course.name}</h1>
        <p className="flex flex-wrap items-center gap-1.5 text-muted">
          Kategori {course.category_code} · {active.length} lektioner · {active.reduce((n, l) => n + l.lesson_count, 0)} × 45 min.
          {course.theory_lessons > 0 && ` · Teori: ${course.theory_lessons} lektioner`}
          {course.active ? <Pill tone="ok">Aktiv</Pill> : <Pill>Slået fra</Pill>}
        </p>
      </header>

      {isAdmin && (
        <details className="rounded-[20px] border border-line bg-surface p-[18px]">
          <summary className="cursor-pointer font-bold">Ret forløbet</summary>
          <ActionForm action={updateCourse} submitLabel="Gem" className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="id" value={course.id} />
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-bold">
                Kategori
                <select name="category" defaultValue={course.category_code} className={`${inputClass.replace("w-full", "")} w-[120px]`}>
                  {(categories ?? []).map((c) => (
                    <option key={c.code}>{c.code}</option>
                  ))}
                </select>
              </label>
              <TextField label="Navn" name="name" required maxLength={80} defaultValue={course.name} className="min-w-[240px] flex-1" />
              <TextField
                label="Teori: antal lektioner"
                name="theoryLessons"
                type="number"
                min={0}
                max={200}
                defaultValue={course.theory_lessons}
                className="w-[180px]"
              />
            </div>
            <p className="text-[13px] text-muted">
              Teori tælles op, når læreren scanner elevens QR-kode og vælger &quot;Teori&quot;. 0 = ingen teori i forløbet.
            </p>
            <label className="flex items-center gap-2.5 text-[15px]">
              <input type="checkbox" name="active" defaultChecked={course.active} className="size-[18px] accent-accent" />
              I brug (kan vælges, når en elev oprettes)
            </label>
          </ActionForm>
          {!lessons.length && (
            <ActionForm action={deleteCourse} submitLabel="Slet forløbet" pendingLabel="…" primary={false} confirmText={`Slet forløbet ${course.name}?`}>
              <input type="hidden" name="id" value={course.id} />
            </ActionForm>
          )}
        </details>
      )}

      <ol className="flex flex-col gap-3" data-testid="course-lessons">
        {lessons.map((l, i) => (
          <li
            key={l.id}
            className={`flex flex-col gap-2 rounded-[20px] border border-line bg-surface p-[18px] ${l.active ? "" : "opacity-60"}`}
            data-testid="course-lesson"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Lektion {l.number}</h2>
                <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
                  {l.lesson_count} × 45 min. · {KIND[l.kind]}
                  {l.location ? ` · ${l.location}` : ""}
                  {!l.active && <Pill>Slået fra</Pill>}
                </p>
              </div>
              {isAdmin && (
                <span className="flex gap-1">
                  <MoveButton id={l.id} courseId={course.id} dir="up" disabled={i === 0} />
                  <MoveButton id={l.id} courseId={course.id} dir="down" disabled={i === lessons.length - 1} />
                </span>
              )}
            </div>
            {l.content && (
              <ul className="flex flex-col gap-0.5 text-[15px]">
                {l.content.split("\n").map((line, k) => (
                  <li key={k}>{line}</li>
                ))}
              </ul>
            )}
            {l.notes && <p className="text-sm text-muted">{l.notes}</p>}
            {l.control_topic && (
              <p className="text-sm">
                <span className="text-muted">Kontrolstof:</span> <b>{l.control_topic}</b>
              </p>
            )}
            {isAdmin && (
              <details className="mt-1 border-t border-line pt-2">
                <summary className="cursor-pointer text-sm font-semibold text-accent-ink">Ret lektion {l.number}</summary>
                <ActionForm action={updateLesson} submitLabel="Gem lektionen" className="mt-3 flex flex-col gap-3">
                  <input type="hidden" name="id" value={l.id} />
                  <LessonFields lesson={l} />
                </ActionForm>
                <ActionForm
                  action={deleteLesson}
                  submitLabel="Slet lektionen"
                  pendingLabel="…"
                  primary={false}
                  confirmText={`Slet lektion ${l.number}?`}
                  className="mt-3 flex flex-col gap-2"
                >
                  <input type="hidden" name="id" value={l.id} />
                </ActionForm>
              </details>
            )}
          </li>
        ))}
      </ol>
      {!lessons.length && <p className="text-muted">Ingen lektioner endnu.</p>}

      {isAdmin && (
        <Box title="Ny lektion">
          <ActionForm action={addLesson} submitLabel="Tilføj lektion" className="flex flex-col gap-3">
            <input type="hidden" name="courseId" value={course.id} />
            <LessonFields />
          </ActionForm>
        </Box>
      )}

      {isAdmin && templates.length > 0 && (
        <Box title="Start fra papiret">
          <ActionForm action={insertTemplate} submitLabel="Indsæt lektionerne" primary={false} className="flex flex-col gap-3">
            <input type="hidden" name="courseId" value={course.id} />
            {templates.map((t, k) => (
              <label key={t.id} className="flex items-center gap-2.5 text-[15px]">
                <input type="radio" name="template" value={t.id} defaultChecked={k === 0} className="size-[18px] accent-accent" />
                {t.label}
              </label>
            ))}
            <p className="text-[13px] text-muted">Lektionerne lægges efter dem, der allerede er i forløbet, og kan rettes bagefter.</p>
          </ActionForm>
        </Box>
      )}
    </>
  );
}

function MoveButton({ id, courseId, dir, disabled }: { id: string; courseId: string; dir: "up" | "down"; disabled: boolean }) {
  return (
    <form action={moveLesson}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="dir" value={dir} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={dir === "up" ? "Flyt op" : "Flyt ned"}
        className="size-9 rounded-lg border border-line text-[15px] font-bold text-muted hover:text-ink disabled:opacity-30"
      >
        {dir === "up" ? "↑" : "↓"}
      </button>
    </form>
  );
}
