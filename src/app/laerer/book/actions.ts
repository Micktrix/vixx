"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { parseDateInput } from "@/lib/dates";
import { TIME_SLOTS, toMinutes } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

// Læreren booker et ledigt lokale eller køretøj til sig selv. Databasen afviser dobbeltbooking,
// booking bagud og ændringer af andres eller lektioners bookinger.
export async function saveOwnBooking(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["instructor"]);
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const id = text("id") || null;
  const date = parseDateInput(text("date"));
  const start = text("start");
  const end = text("end");
  if (!date) return { error: "Ugyldig dato." };
  if (!TIME_SLOTS.includes(start) || !TIME_SLOTS.includes(end) || toMinutes(end) <= toMinutes(start)) {
    return { error: "Vælg et tidsrum, hvor \"til\" er efter \"fra\"." };
  }

  const supabase = await createClient();
  const { data: me } = await supabase
    .from("instructors")
    .select("id")
    .eq("school_id", membership.schoolId)
    .eq("user_id", user.id)
    .single();

  const values = {
    resource_id: text("resourceId"),
    booking_date: date,
    start_time: start,
    minutes: toMinutes(end) - toMinutes(start),
    title: text("title") || null,
    instructor_id: me?.id,
  };
  const { error } = id
    ? await supabase.from("bookings").update(values).eq("id", id)
    : await supabase.from("bookings").insert({ ...values, school_id: membership.schoolId, created_by: user.id });
  if (["23P01", "23514", "42501"].includes(error?.code ?? "")) return { error: error!.message };
  if (error) return { error: "Bookingen kunne ikke gemmes. Prøv igen." };

  revalidatePath("/laerer", "layout");
  revalidatePath("/kontor", "layout");
  redirect(`/laerer/book?dato=${date}`);
}

export async function deleteOwnBooking(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["instructor"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .select("booking_date");
  if (error?.code === "42501") return { error: error.message };
  if (error || !data?.length) return { error: "Bookingen kunne ikke slettes." };
  revalidatePath("/laerer", "layout");
  revalidatePath("/kontor", "layout");
  redirect(`/laerer/book?dato=${data[0].booking_date}`);
}
