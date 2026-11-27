import { Box } from "@/components/box";
import { ActionForm, CheckChip } from "@/components/form";
import { savePlanTeachers } from "./actions";

// "Undervisende kørelærere" på holdet (alle holdets elever) eller på en elev uden hold. Kontoret vælger dem; de
// kommer øverst på modulplanen med navn og gemt underskrift. Lærere, der scanner eleven, kommer selv på listen.
export function PlanTeachersBox({
  target,
  id,
  teachers,
  chosen,
  collapsible = false,
}: {
  target: "team" | "student";
  id: string;
  teachers: { id: string; name: string }[];
  chosen: string[];
  collapsible?: boolean;
}) {
  return (
    <Box
      collapsible={collapsible}
      title="Undervisende kørelærere"
      hint={target === "team" ? "Kommer øverst på modulplanen for alle holdets elever" : "Kommer øverst på elevens modulplan"}
    >
      <ActionForm action={savePlanTeachers} submitLabel="Gem" className="flex flex-col gap-3">
        <input type="hidden" name="target" value={target} />
        <input type="hidden" name="id" value={id} />
        <div className="flex flex-wrap gap-2" data-testid="plan-teachers">
          {teachers.map((t) => (
            <CheckChip key={t.id} name="planTeachers" value={t.id} label={t.name} defaultChecked={chosen.includes(t.id)} />
          ))}
        </div>
        <p className="text-[13px] text-muted">
          Fx teorilærere. Nye kan tilføjes undervejs. Mangler en lærers underskrift, kommer den på, når læreren har gemt den.
        </p>
      </ActionForm>
    </Box>
  );
}
