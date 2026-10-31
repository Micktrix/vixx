"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Besked fra kontoret til alle lærere eller én lærer. Vises i lærer-appen under Beskeder.
export async function sendMessage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["admin", "office"]);
  const body = String(formData.get("body") ?? "").trim();
  const to = String(formData.get("to") ?? "");
  if (!body) return { error: "Skriv en besked." };
  if (body.length > 1000) return { error: "Beskeden er for lang (højst 1000 tegn)." };

  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({
    school_id: membership.schoolId,
    recipient_instructor_id: to === "all" ? null : to,
    kind: "message",
    body,
    sent_by: user.id,
  });
  if (error) return { error: "Beskeden kunne ikke sendes. Prøv igen." };

  revalidatePath("/kontor/beskeder");
  revalidatePath("/laerer", "layout");
  return { message: to === "all" ? "Beskeden er sendt til alle undervisere." : "Beskeden er sendt." };
}

// Påmindelse til en lærer, der mangler at registrere (fra Godkendelser).
export async function sendReminder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["admin", "office"]);
  const instructorId = String(formData.get("instructorId") ?? "");
  const days = String(formData.get("days") ?? "").trim();
  if (!instructorId) return { error: "Ukendt underviser." };

  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({
    school_id: membership.schoolId,
    recipient_instructor_id: instructorId,
    kind: "notification",
    body: `Påmindelse fra kontoret: Du mangler at registrere lektioner${days ? ` for ${days}` : ""}. Registrér dem i kalenderen.`,
    sent_by: user.id,
  });
  if (error) return { error: "Påmindelsen kunne ikke sendes. Prøv igen." };

  revalidatePath("/kontor/beskeder");
  revalidatePath("/laerer", "layout");
  return { message: "Påmindelse sendt." };
}
