import { ActionForm, TextField } from "@/components/form";
import { inputClass } from "@/components/styles";
import { Box } from "@/components/box";
import { addModule, deleteModule, updateModule } from "../actions";

export type ModuleRow = {
  id: string;
  number: number;
  name: string;
  min_theory: number;
  min_driving: number;
  min_dark: number;
  topics: string | null;
  notes: string | null;
};

// Minimum for et modul, fx "Minimum 9 teori- og 6 kørselslektioner, heraf 1 i mørke".
export function moduleMinimum(m: Pick<ModuleRow, "min_theory" | "min_driving" | "min_dark">) {
  const dark = m.min_dark > 0 ? `, heraf ${m.min_dark} i mørke` : "";
  if (!m.min_driving) return `Minimum ${m.min_theory} teorilektioner`;
  if (!m.min_theory) return `Minimum ${m.min_driving} kørselslektioner${dark}`;
  return `Minimum ${m.min_theory} teori- og ${m.min_driving} kørselslektioner${dark}`;
}

// Modulerne i et modulforløb, som på Færdselsstyrelsens modulplan. Admin kan rette hvert modul.
export function ModuleList({ modules, isAdmin }: { modules: ModuleRow[]; isAdmin: boolean }) {
  return (
    <ol className="flex flex-col gap-3" data-testid="course-modules">
      {modules.map((m) => (
        <li key={m.id} className="flex flex-col gap-2 rounded-[20px] border border-line bg-surface p-[18px]" data-testid="course-module">
          <div>
            <h2 className="text-lg font-bold">
              Modul {m.number} – {m.name}
            </h2>
            <p className="text-sm text-muted">{moduleMinimum(m)}</p>
          </div>
          {m.topics && (
            <ul className="flex flex-col gap-0.5 text-[15px]">
              {m.topics.split("\n").map((line, k) => (
                <li key={k} className={line.startsWith("Afsnit") ? "mt-1 font-semibold first:mt-0" : "pl-4"}>
                  {line}
                </li>
              ))}
            </ul>
          )}
          {m.notes && <p className="text-sm text-muted">{m.notes}</p>}
          {isAdmin && (
            <details className="mt-1 border-t border-line pt-2">
              <summary className="cursor-pointer text-sm font-semibold text-accent-ink">Ret modul {m.number}</summary>
              <ActionForm action={updateModule} submitLabel="Gem modulet" className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="id" value={m.id} />
                <TextField label="Navn" name="name" required maxLength={120} defaultValue={m.name} />
                <div className="flex flex-wrap gap-3">
                  <TextField label="Min. teori" name="minTheory" type="number" min={0} max={100} defaultValue={m.min_theory} className="w-[130px]" />
                  <TextField label="Min. kørsel" name="minDriving" type="number" min={0} max={100} defaultValue={m.min_driving} className="w-[130px]" />
                  <TextField label="Heraf i mørke" name="minDark" type="number" min={0} max={100} defaultValue={m.min_dark} className="w-[130px]" />
                </div>
                <label className="flex flex-col gap-1.5 text-sm font-bold">
                  Emner (én linje pr. afsnit)
                  <textarea name="topics" rows={8} maxLength={4000} defaultValue={m.topics ?? ""} className={inputClass} />
                </label>
                <TextField label="Note" name="notes" maxLength={1000} defaultValue={m.notes ?? ""} />
              </ActionForm>
              <ActionForm
                action={deleteModule}
                submitLabel="Slet modulet"
                pendingLabel="…"
                primary={false}
                confirmText={`Slet modul ${m.number}?`}
                className="mt-3 flex flex-col gap-2"
              >
                <input type="hidden" name="id" value={m.id} />
              </ActionForm>
            </details>
          )}
        </li>
      ))}
    </ol>
  );
}

// Nyt modul i et modulforløb, fx når skolen bygger EU-modulerne selv. Kun admin.
export function NewModuleForm({ courseId, next }: { courseId: string; next: number }) {
  return (
    <Box title="Nyt modul" hint="Fx når skolen bygger EU-modulerne efter blanketten">
      <ActionForm action={addModule} submitLabel="Tilføj modul" className="flex flex-col gap-3">
        <input type="hidden" name="courseId" value={courseId} />
        <div className="flex flex-wrap items-end gap-3">
          <TextField label="Nummer" name="number" type="number" min={1} max={20} defaultValue={next} required className="w-[110px]" />
          <TextField label="Navn" name="name" required maxLength={120} className="min-w-[240px] flex-1" />
        </div>
        <div className="flex flex-wrap gap-3">
          <TextField label="Min. teori" name="minTheory" type="number" min={0} max={100} defaultValue={0} className="w-[130px]" />
          <TextField label="Min. kørsel" name="minDriving" type="number" min={0} max={100} defaultValue={0} className="w-[130px]" />
          <TextField label="Heraf i mørke" name="minDark" type="number" min={0} max={100} defaultValue={0} className="w-[130px]" />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Emner (én linje pr. afsnit)
          <textarea name="topics" rows={4} maxLength={4000} className={inputClass} />
        </label>
      </ActionForm>
    </Box>
  );
}
