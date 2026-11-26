import { ActionForm, TextField } from "@/components/form";
import { inputClass } from "@/components/styles";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { deleteEuTopic, saveEuTopic } from "../eu-actions";
import { EuPdfUpload } from "./eu-pdf-upload";

type Row = { id: string; kind: string; sort: number; code: string; goal: string | null; description: string | null; hours: number | null; lessons: number | null };

// EU-forløbets emner (med den faste "faktisk anvendt tid" fra blanketten), køretimer og skolens blanketter (trin E9).
// Admin retter og lægger en ny blanket op, når forløbet er låst op (`editing`).
export async function EuTopicList({ courseId, editing }: { courseId: string; editing: boolean }) {
  const supabase = await createClient();
  const [{ data }, { data: files }] = await Promise.all([
    supabase.from("eu_topics").select("id, kind, sort, code, goal, description, hours, lessons").eq("course_id", courseId).order("sort"),
    supabase.from("eu_plan_files").select("id, file_name, created_at").eq("course_id", courseId).order("created_at", { ascending: false }),
  ]);
  const rows = (data ?? []) as Row[];
  const topics = rows.filter((r) => r.kind === "topic");
  const drives = rows.filter((r) => r.kind === "drive");
  const total = topics.reduce((n, t) => n + Number(t.hours ?? 0), 0);
  const next = (list: Row[]) => (list.at(-1)?.sort ?? 0) + 1;
  return (
    <>
      <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]" data-testid="eu-topics">
        <h2 className="text-lg font-bold">Emner</h2>
        <ol className="flex flex-col gap-1 text-[15px]">
          {topics.map((t) =>
            editing ? (
              <li key={t.id}>
                <details className="rounded-lg border border-line px-3 py-2">
                  <summary className="cursor-pointer">
                    <b>{t.code}</b> {t.goal} <span className="text-muted">· {t.hours != null ? `${Number(t.hours)} t` : "–"}</span>
                  </summary>
                  <TopicForm courseId={courseId} row={t} />
                  <ActionForm action={deleteEuTopic} submitLabel="Slet emnet" pendingLabel="…" primary={false} confirmText={`Slet emne ${t.code}?`} className="mt-2">
                    <input type="hidden" name="courseId" value={courseId} />
                    <input type="hidden" name="id" value={t.id} />
                  </ActionForm>
                </details>
              </li>
            ) : (
              <li key={t.id} className="flex gap-3">
                <b className="w-12 shrink-0">{t.code}</b>
                <span className="flex-1">{t.goal}</span>
                <span className="shrink-0 text-muted">{t.hours != null ? `${Number(t.hours)} t` : "–"}</span>
              </li>
            ),
          )}
        </ol>
        {editing && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-muted hover:text-ink">+ Nyt emne</summary>
            <TopicForm courseId={courseId} sort={next(topics)} />
          </details>
        )}
        <p className="text-sm text-muted">I alt {total} t (faktisk anvendt tid fra blanketten; tom = skrives i hånden).</p>

        <h2 className="text-lg font-bold">Køretimer</h2>
        <ul className="flex flex-col gap-1 text-[15px]">
          {drives.map((d) =>
            editing ? (
              <li key={d.id} className="flex flex-wrap items-end gap-2">
                <DriveForm courseId={courseId} row={d} />
                <ActionForm action={deleteEuTopic} submitLabel="Slet" pendingLabel="…" primary={false} confirmText={`Slet køretimen ${d.code}?`}>
                  <input type="hidden" name="courseId" value={courseId} />
                  <input type="hidden" name="id" value={d.id} />
                </ActionForm>
              </li>
            ) : (
              <li key={d.id}>
                {d.code} · {d.lessons} × 45 min.
              </li>
            ),
          )}
          {!drives.length && !editing && <li className="text-sm text-muted">Ingen faste køretimer; læreren skriver emnet ved scanning.</li>}
        </ul>
        {editing && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-muted hover:text-ink">+ Ny køretime</summary>
            <DriveForm courseId={courseId} sort={next(drives)} />
          </details>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]" data-testid="eu-files">
        <h2 className="text-lg font-bold">Skolens blanket (PDF)</h2>
        <p className="text-sm text-muted">
          Vixx printer sin egen kopi af blanketten. Når blanketten ændres, lægger admin den nye op her og retter emner og timer ovenfor (lås op først).
        </p>
        {files?.length ? (
          <ul className="text-[15px]">
            {files.map((f, i) => (
              <li key={f.id}>
                <a href={`/api/eu-pdf/${f.id}`} target="_blank" rel="noopener" className="font-semibold text-accent-ink hover:underline">
                  {f.file_name}
                </a>{" "}
                <span className="text-muted">· lagt op {formatDate(f.created_at.slice(0, 10))}{i === 0 ? " · nyeste" : ""}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Ingen blanket lagt op endnu.</p>
        )}
        {editing && <EuPdfUpload courseId={courseId} />}
      </section>
    </>
  );
}

function TopicForm({ courseId, row, sort }: { courseId: string; row?: Row; sort?: number }) {
  return (
    <ActionForm action={saveEuTopic} submitLabel={row ? "Gem" : "Tilføj emne"} className="mt-2 flex flex-col gap-2">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="kind" value="topic" />
      {row && <input type="hidden" name="id" value={row.id} />}
      <div className="flex flex-wrap items-end gap-3">
        <TextField label="Emne" name="code" required maxLength={80} defaultValue={row?.code ?? ""} placeholder="1.2" className="w-[100px]" />
        <TextField label="Rækkefølge" name="sort" type="number" min={1} max={200} required defaultValue={row?.sort ?? sort} className="w-[110px]" />
        <TextField label="Timer" name="hours" defaultValue={row?.hours != null ? String(row.hours) : ""} placeholder="tom = i hånden" className="w-[140px]" />
      </div>
      <TextField label="Mål" name="goal" maxLength={500} defaultValue={row?.goal ?? ""} />
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Beskrivelse
        <textarea name="description" rows={4} maxLength={3000} defaultValue={row?.description ?? ""} className={inputClass} />
      </label>
    </ActionForm>
  );
}

function DriveForm({ courseId, row, sort }: { courseId: string; row?: Row; sort?: number }) {
  return (
    <ActionForm action={saveEuTopic} submitLabel={row ? "Gem" : "Tilføj"} pendingLabel="…" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="kind" value="drive" />
      <input type="hidden" name="sort" value={row?.sort ?? sort} />
      {row && <input type="hidden" name="id" value={row.id} />}
      <TextField label="Køretime" name="code" required maxLength={80} defaultValue={row?.code ?? ""} placeholder="Fx EU tur" className="w-[220px]" />
      <TextField label="× 45 min." name="lessons" type="number" min={1} max={20} required defaultValue={row?.lessons ?? 2} className="w-[100px]" />
    </ActionForm>
  );
}
