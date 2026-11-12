import { CheckChip, Fieldset, TextField } from "@/components/form";
import { inputClass } from "@/components/styles";

export type LessonRow = {
  id: string;
  number: string;
  kind: "driving" | "theory";
  lesson_count: number;
  location: string | null;
  content: string | null;
  notes: string | null;
  control_topic: string | null;
  active: boolean;
};

const area = `${inputClass} h-auto py-2.5 leading-snug`;

// Felterne på en lektion i forløbet, som på lektionsplanen på papir.
export function LessonFields({ lesson }: { lesson?: LessonRow }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Lektion nr." name="number" required maxLength={20} defaultValue={lesson?.number} placeholder="Fx 4" />
        <TextField
          label="Antal × 45 min."
          name="lessonCount"
          type="number"
          min={1}
          max={20}
          required
          defaultValue={lesson?.lesson_count ?? 2}
        />
        <TextField label="Sted (valgfri)" name="location" maxLength={80} defaultValue={lesson?.location ?? ""} placeholder="Fx Øvelsesstrækning" />
      </div>
      <Fieldset legend="Type" hint="Teorilektioner kommer ikke med på lønnen, når læreren kvitterer.">
        <CheckChip type="radio" name="kind" value="driving" label="Kørsel" defaultChecked={(lesson?.kind ?? "driving") === "driving"} />
        <CheckChip type="radio" name="kind" value="theory" label="Teori" defaultChecked={lesson?.kind === "theory"} />
      </Fieldset>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Indhold
        <textarea
          name="content"
          rows={6}
          maxLength={4000}
          defaultValue={lesson?.content ?? ""}
          placeholder={"Ét punkt pr. linje, fx\n7.1 Igangsætning og standsning v. kantsten\n7.2 Placering under ligeudkørsel"}
          className={area}
        />
        <span className="text-[13px] font-normal text-muted">Ét punkt pr. linje. Læreren kan senere markere punkter, der ikke blev nået.</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Noter (valgfri)
          <textarea name="notes" rows={2} maxLength={1000} defaultValue={lesson?.notes ?? ""} placeholder="Fx Samt repetition fra lektion 4" className={area} />
        </label>
        <TextField
          label="Kontrolstof (valgfri)"
          name="controlTopic"
          maxLength={200}
          defaultValue={lesson?.control_topic ?? ""}
          placeholder="Fx Bremser og styretøj"
        />
      </div>
      {lesson && (
        <label className="flex items-center gap-2.5 text-[15px]">
          <input type="checkbox" name="active" defaultChecked={lesson.active} className="size-[18px] accent-accent" />
          I brug
        </label>
      )}
    </>
  );
}
