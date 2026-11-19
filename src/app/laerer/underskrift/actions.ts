"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isValidStrokes } from "@/lib/signature";

// Læreren gemmer sin egen underskrift. Kun læreren selv kan se og rette den (RLS).
export async function saveSignature(strokes: string): Promise<ActionState> {
  const { user, membership } = await requireRole(["instructor"]);
  if (!isValidStrokes(strokes)) return { error: "Tegn din underskrift, før du gemmer." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("instructor_signatures")
    .upsert({ school_id: membership.schoolId, user_id: user.id, strokes }, { onConflict: "school_id,user_id" });
  if (error) return { error: "Underskriften kunne ikke gemmes. Prøv igen." };

  revalidatePath("/laerer/underskrift");
  return { message: "Din underskrift er gemt og låst." };
}
