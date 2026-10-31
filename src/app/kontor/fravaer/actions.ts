"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { parseDateInput } from "@/lib/dates";
import { TIME_SLOTS } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { calendarHref } from "../calendar/params";

const REASONS = ["sick", "off", "other"] as const;

// Fravær blokerer tiden og tæller aldrig i lønnen. Overlap afvises af databasen.
export async function saveAbsence(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["admin", "office"]);
  const text = (k: string) => String(formData.get(k) ?? "").trim();

  const id = text("id") || null;
  const instructorId = text("instructorId");
  const date = parseDateInput(text("date"));
  const start = text("start");
  const hours = Number(text("hours").replace(",", "."));
  const reason = text("reason") as (typeof REASONS)[number];

  if (!instructorId) return { error: "Vælg en underviser." };
  if (!REASONS.includes(reason)) return { error: "Vælg en årsag." };
  if (!date) return { error: "Vælg en dato." };
  if (!TIME_SLOTS.includes(start)) return { error: "Vælg fra hvilket klokkeslæt." };
  if (!(hours > 0 && hours <= 24) || Math.round(hours * 4) !== hours * 4) {
    return { error: "Antal timer skal være mellem 0,25 og 24 (i kvarterer)." };
  }

  const values = {
    instructor_id: instructorId,
    absence_date: date,
    start_time: start,
    hours,
    reason,
    note: text("note") || null,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("absences").update(values).eq("id", id).eq("school_id", membership.schoolId)
    : await supabase.from("absences").insert({ ...values, school_id: membership.schoolId, created_by: user.id });
  if (error?.code === "23P01") return { error: error.message };
  if (error) return { error: "Fraværet kunne ikke gemmes. Prøv igen." };

  revalidatePath("/kontor", "layout");
  redirect(calendarHref({ view: "dag", date }));
}

export async function deleteAbsence(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("absences")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("school_id", membership.schoolId)
    .select("absence_date");
  if (error || !data?.length) return { error: "Fraværet kunne ikke fjernes. Prøv igen." };

  revalidatePath("/kontor", "layout");
  redirect(calendarHref({ view: "dag", date: data[0].absence_date }));
}
