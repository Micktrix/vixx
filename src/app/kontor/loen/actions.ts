"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { parseDateInput } from "@/lib/dates";
import { periodFor } from "@/lib/pay-period";
import { createClient } from "@/lib/supabase/server";

// Kontoret og admin kan låse en lønperiode. Kun admin kan låse op (håndhæves også i databasen).
async function setLocked(formData: FormData, locked: boolean): Promise<ActionState> {
  const { membership } = await requireRole(locked ? ["admin", "office"] : ["admin"]);
  const supabase = await createClient();
  const { data: school } = await supabase.from("schools").select("pay_period_start_day").eq("id", membership.schoolId).single();
  const start = parseDateInput(String(formData.get("start") ?? ""));
  if (!start || !school) return { error: "Ukendt periode." };
  const period = periodFor(start, school.pay_period_start_day);

  const { error } = await supabase
    .from("pay_periods")
    .upsert(
      { school_id: membership.schoolId, starts_on: period.start, ends_on: period.end, locked },
      { onConflict: "school_id,starts_on" },
    );
  if (error?.code === "42501") return { error: error.message };
  if (error) return { error: "Det lykkedes ikke. Prøv igen." };

  revalidatePath("/kontor", "layout");
  revalidatePath("/laerer", "layout");
  return {
    message: locked
      ? "Perioden er låst. Intet i den kan ændres, før admin låser op."
      : "Perioden er låst op. Husk at låse igen, når rettelserne er lavet.",
  };
}

export async function lockPeriod(_prev: ActionState, formData: FormData) {
  return setLocked(formData, true);
}

export async function unlockPeriod(_prev: ActionState, formData: FormData) {
  return setLocked(formData, false);
}
