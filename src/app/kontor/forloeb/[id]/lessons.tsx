import { ActionForm, TextField } from "@/components/form";
import { inputClass } from "@/components/styles";
import { lessonItems, type PlanLesson } from "@/lib/module-progress";
import { addModuleLesson, deleteModuleLesson, updateModuleLesson } from "../actions";

// Skolens kørelektioner under et modul (fx lektion 2, 4 og 6 fra lektionsskemaet). Admin retter dem.
export function ModuleLessons({ moduleId, lessons, isAdmin }: { moduleId: string; lessons: PlanLesson[]; isAdmin: boolean }) {
  const sorted = [...lessons].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2" data-testid="module-lessons">
      <b className="text-sm">Kørelektioner ({sorted.filter((l) => l.active).length})</b>
      {sorted.map((l) => (
        <div key={l.id} className={`rounded-[14px] border border-line px-3 py-2 ${l.active ? "" : "opacity-60"}`} data-testid="module-lesson">
          <p className="text-[15px]">
            <b>Lektion {l.number}</b>{" "}
            <span className="text-sm text-muted">
              · {l.lesson_count} × 45 min.{l.dark ? " · i mørke" : ""}
              {l.location ? ` · ${l.location}` : ""}
              {!l.active ? " · slået fra" : ""}
            </span>
          </p>
          <ul className="text-[14px]">
            {lessonItems(l.content).map((item) => (
              <li key={item} className="pl-3">
                {item}
              </li>
            ))}
          </ul>
          {l.notes && <p className="text-sm text-muted">{l.notes}</p>}
          {l.control_topic && <p className="text-sm">Kontrolstof: {l.control_topic}</p>}
          {isAdmin && (
            <details className="mt-1 text-sm">
              <summary className="cursor-pointer font-semibold text-accent-ink">Ret lektion {l.number}</summary>
              <ActionForm action={updateModuleLesson} submitLabel="Gem lektionen" className="mt-2 flex flex-col gap-2">
                <input type="hidden" name="id" value={l.id} />
                <LessonFields lesson={l} />
                <label className="flex items-center gap-2.5 text-[15px]">
                  <input type="checkbox" name="active" defaultChecked={l.active} className="size-[18px] accent-accent" />I brug
                </label>
              </ActionForm>
              <ActionForm action={deleteModuleLesson} submitLabel="Slet lektionen" pendingLabel="…" primary={false} confirmText={`Slet lektion ${l.number}?`} className="mt-2">
                <input type="hidden" name="id" value={l.id} />
              </ActionForm>
            </details>
          )}
        </div>
      ))}
      {isAdmin && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-accent-ink">Ny kørelektion i modulet</summary>
          <ActionForm action={addModuleLesson} submitLabel="Tilføj lektion" className="mt-2 flex flex-col gap-2">
            <input type="hidden" name="moduleId" value={moduleId} />
            <LessonFields />
          </ActionForm>
        </details>
      )}
    </div>
  );
}

function LessonFields({ lesson }: { lesson?: PlanLesson }) {
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <TextField label="Lektion nr." name="number" required maxLength={20} defaultValue={lesson?.number ?? ""} className="w-[110px]" />
        <TextField label="Antal × 45 min." name="lessonCount" type="number" min={1} max={8} defaultValue={lesson?.lesson_count ?? 2} className="w-[130px]" />
        <TextField label="Sted" name="location" maxLength={120} defaultValue={lesson?.location ?? ""} placeholder="Fx Øvelsesstrækning" className="min-w-[200px] flex-1" />
      </div>
      <label className="flex items-center gap-2.5 text-[15px]">
        <input type="checkbox" name="dark" defaultChecked={lesson?.dark ?? false} className="size-[18px] accent-accent" />
        Kørsel i mørke
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Punkter (ét pr. linje)
        <textarea name="content" rows={5} maxLength={4000} defaultValue={lesson?.content ?? ""} className={inputClass} />
      </label>
      <TextField label="Note" name="notes" maxLength={1000} defaultValue={lesson?.notes ?? ""} placeholder="Fx Samt repetition fra lektion 4" />
      <TextField label="Kontrolstof" name="controlTopic" maxLength={200} defaultValue={lesson?.control_topic ?? ""} placeholder="Fx Bremser og styretøj" />
    </>
  );
}
