import { TextField } from "@/components/form";

export function RateGroupFields({ name, payrollCode }: { name?: string; payrollCode?: string | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField label="Navn" name="name" required maxLength={40} defaultValue={name} placeholder="Fx Amu kørsel" />
      <TextField
        label="Løndel i Dataløn"
        name="payrollCode"
        maxLength={20}
        defaultValue={payrollCode ?? ""}
        placeholder="Fx 2101"
        hint="Bruges i Dataløn-eksporten. Kan udfyldes senere."
      />
    </div>
  );
}
