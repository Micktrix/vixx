"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { parseDateInput, todayDk } from "@/lib/dates";
import { TIME_SLOTS, toMinutes } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

async function ownInstructor() {
  const { user, membership } = await requireRole(["instructor"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("instructors")
    .select("id, availability")
    .eq("school_id", membership.schoolId)
    .eq("user_id", user.id)
    .single();
  return { user, membership, supabase, instructor: data };
}

function refresh() {
  revalidatePath("/laerer", "layout");
  revalidatePath("/kontor", "layout");
}

// "Jeg kan arbejde": ét tidsrum på en eller flere datoer. Kun for lærere på "Efter aftale".
export async function saveCanWork(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership, supabase, instructor } = await ownInstructor();
  if (instructor?.availability !== "on_request") return { error: "Kun for undervisere på \"Efter aftale\"." };

  const today = todayDk();
  const dates = [...new Set(formData.getAll("dates").map(String))].map(parseDateInput);
  const start = String(formData.get("start") ?? "");
  const end = String(formData.get("end") ?? "");
  if (!dates.length) return { error: "Vælg mindst én dato." };
  if (dates.some((d) => !d || d < today)) return { error: "Vælg datoer fra i dag og frem." };
  if (!TIME_SLOTS.includes(start) || !TIME_SLOTS.includes(end) || toMinutes(end) <= toMinutes(start)) {
    return { error: "Vælg et tidsrum, hvor \"til\" er efter \"fra\"." };
  }

  const { error } = await supabase.from("availability").insert(
    (dates as string[]).map((d) => ({
      school_id: membership.schoolId,
      instructor_id: instructor.id,
      available_date: d,
      start_time: start,
      end_time: end,
    })),
  );
  if (error) return { error: "Det lykkedes ikke at gemme. Prøv igen." };
  refresh();
  redirect(`/laerer?dag=${[...(dates as string[])].sort()[0]}`);
}

export async function requestHoliday(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership, supabase, instructor } = await ownInstructor();
  const from = parseDateInput(String(formData.get("from") ?? ""));
  const to = parseDateInput(String(formData.get("to") ?? ""));
  if (!from || !to) return { error: "Vælg fra og til." };
  if (from < todayDk()) return { error: "Ferie kan kun søges fra i dag og frem." };
  if (to < from) return { error: "\"Til\" skal være samme dag som \"fra\" eller senere." };

  // Status sættes altid til "afventer" af databasen, når en lærer opretter ferie.
  const { error } = await supabase.from("holidays").insert({
    school_id: membership.schoolId,
    instructor_id: instructor!.id,
    from_date: from,
    to_date: to,
    note: String(formData.get("note") ?? "").trim() || null,
  });
  if (error) return { error: "Anmodningen kunne ikke sendes. Prøv igen." };
  refresh();
  return { message: "Din ferieanmodning er sendt til kontoret." };
}

export async function cancelHoliday(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["instructor"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("holidays")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("status", "pending")
    .select("id");
  if (error || !data?.length) return { error: "Kun anmodninger, der afventer, kan trækkes tilbage." };
  refresh();
  return { message: "Anmodningen er trukket tilbage." };
}

export async function markMessagesRead(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["instructor"]);
  const supabase = await createClient();
  const ids = formData.getAll("messageId").map(String);
  if (!ids.length) return undefined;
  const { error } = await supabase
    .from("message_reads")
    .upsert(
      ids.map((id) => ({ school_id: membership.schoolId, message_id: id, user_id: user.id })),
      { onConflict: "message_id,user_id", ignoreDuplicates: true },
    );
  if (error) return { error: "Det lykkedes ikke. Prøv igen." };
  revalidatePath("/laerer", "layout");
  return { message: "Markeret som læst." };
}
