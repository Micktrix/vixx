"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Eleven bekræfter, at lektionen er gennemført (elevens underskrift). Databasen tjekker, at det er
// elevens egen kvittering, og at den kun bekræftes én gang.
export async function confirmSignoff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["student", "admin"]); // admin bekræfter for sin demo-elev
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_signoffs")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", id)
    .is("confirmed_at", null)
    .select("id");
  if (error || !data?.length) return { error: "Lektionen kunne ikke bekræftes. Prøv igen." };
  revalidatePath("/elev", "layout");
  revalidatePath("/kontor/demo-elev");
  return { message: "Tak! Lektionen er bekræftet." };
}
