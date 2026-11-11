import { TextField } from "@/components/form";

type Service = { name: string; payroll_code: string | null };

// Navn og Dataløn-løndel. Satsen har sine egne felter (PriceFields).
export function ServiceFields({ service }: { service?: Service }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField
        label="Navn"
        name="name"
        required
        maxLength={40}
        defaultValue={service?.name}
        placeholder="Fx AMU-teori"
      />
      <TextField
        label="Løndel i Dataløn"
        name="payrollCode"
        maxLength={20}
        defaultValue={service?.payroll_code ?? ""}
        placeholder="Fx 2101"
        hint="Bruges i Dataløn-eksporten. Kan udfyldes senere."
      />
    </div>
  );
}
