"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { addDays, formatDate, isWeekend, parseDateInput } from "@/lib/dates";
import { TIME_SLOTS, toMinutes } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/kontor", "layout");
  revalidatePath("/laerer", "layout");
  revalidatePath("/storskaerm");
}

// Kontoret booker et lokale eller køretøj. Dobbeltbooking afvises af databasen.
export async function saveBooking(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["admin", "office"]);
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const id = text("id") || null;
  const resourceId = text("resourceId");
  const date = parseDateInput(text("date"));
  const start = text("start");
  const end = text("end");
  if (!resourceId) return { error: "Vælg lokale eller køretøj." };
  if (!date) return { error: "Vælg en dato." };
  if (!TIME_SLOTS.includes(start) || !TIME_SLOTS.includes(end) || toMinutes(end) <= toMinutes(start)) {
    return { error: "Vælg et tidsrum, hvor \"til\" er efter \"fra\"." };
  }

  const values = {
    resource_id: resourceId,
    booking_date: date,
    start_time: start,
    minutes: toMinutes(end) - toMinutes(start),
    title: text("title") || null,
    instructor_id: text("instructorId") || null,
  };
  const supabase = await createClient();

  // Flere dage (kun ved ny booking): samme tidsrum hver dag til og med slutdatoen.
  if (!id && formData.get("multiDay") === "on") {
    const endDate = parseDateInput(text("endDate"));
    if (!endDate || endDate < date) return { error: "Vælg en slutdato, der ikke er før startdatoen." };
    const weekdaysOnly = formData.get("weekdaysOnly") === "on";
    const dates: string[] = [];
    for (let d = date; d <= endDate; d = addDays(d, 1)) {
      if (!weekdaysOnly || !isWeekend(d)) dates.push(d);
      if (dates.length > 60) return { error: "Højst 60 dage ad gangen." };
    }
    if (!dates.length) return { error: "Der er ingen hverdage i perioden." };

    // Én dag ad gangen, så en fejl kan sige hvilken dag. Fejler en dag, fortrydes de andre.
    const created: string[] = [];
    for (const d of dates) {
      const { data, error } = await supabase
        .from("bookings")
        .insert({ ...values, booking_date: d, school_id: membership.schoolId, created_by: user.id })
        .select("id")
        .single();
      if (error || !data) {
        if (created.length) await supabase.from("bookings").delete().in("id", created);
        if (error?.code === "23P01" || error?.code === "23514") return { error: `${formatDate(d)}: ${error.message} Intet er booket.` };
        return { error: "Bookingerne kunne ikke gemmes. Prøv igen." };
      }
      created.push(data.id);
    }
  } else {
    const { error } = id
      ? await supabase.from("bookings").update(values).eq("id", id).eq("school_id", membership.schoolId).is("scheduled_lesson_id", null)
      : await supabase.from("bookings").insert({ ...values, school_id: membership.schoolId, created_by: user.id });
    if (error?.code === "23P01" || error?.code === "23514") return { error: error.message };
    if (error) return { error: "Bookingen kunne ikke gemmes. Prøv igen." };
  }

  refresh();
  const { data: resource } = await supabase.from("resources").select("kind").eq("id", resourceId).single();
  redirect(`${resource?.kind === "vehicle" ? "/kontor/koeretoejer" : "/kontor/lokaler"}?vis=dag&dato=${date}`);
}

export async function deleteBooking(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin", "office"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("school_id", membership.schoolId)
    .select("booking_date, resources(kind)");
  if (error || !data?.length) return { error: "Bookingen kunne ikke slettes. Prøv igen." };
  refresh();
  const kind = (data[0].resources as unknown as { kind: string } | null)?.kind;
  redirect(`${kind === "vehicle" ? "/kontor/koeretoejer" : "/kontor/lokaler"}?vis=dag&dato=${data[0].booking_date}`);
}
