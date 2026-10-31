"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Godkend eller afvis en ferieanmodning. Databasen afviser godkendelse, hvis der ligger lektioner i perioden.
export async function decideHoliday(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["admin", "office"]);
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "approved" && decision !== "rejected") return { error: "Ukendt valg." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("holidays")
    .update({ status: decision, decided_by: user.id, decided_at: new Date().toISOString() })
    .eq("id", String(formData.get("id") ?? ""))
    .eq("school_id", membership.schoolId)
    .eq("status", "pending")
    .select("id");
  if (error?.code === "23P01") return { error: error.message };
  if (error || !data?.length) return { error: "Det lykkedes ikke. Prøv igen." };

  revalidatePath("/kontor", "layout");
  return { message: decision === "approved" ? "Ferien er godkendt." : "Ferien er afvist." };
}
