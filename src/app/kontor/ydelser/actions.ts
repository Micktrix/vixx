"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { formatDate, parseDateInput } from "@/lib/dates";
import { formatKroner, parseKroner } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

// Kun admin ændrer satser, ydelser og priser (RLS håndhæver det også).
// Alt kører som den indloggede bruger, så ændringsloggen viser hvem.

const PAGE = "/kontor/ydelser";

function refresh() {
  revalidatePath(PAGE, "layout");
  revalidatePath("/kontor/undervisere", "layout");
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

// ---------------------------------------------------------------------------
// Satser
// ---------------------------------------------------------------------------
function readRateGroup(formData: FormData): { error: string } | { name: string; payroll_code: string | null } {
  const name = text(formData, "name");
  const payrollCode = text(formData, "payrollCode") || null;
  if (!name) return { error: "Skriv et navn." };
  if (name.length > 40) return { error: "Navnet er for langt." };
  if (payrollCode && payrollCode.length > 20) return { error: "Løndelen er for lang." };
  return { name, payroll_code: payrollCode };
}

export async function createRateGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const values = readRateGroup(formData);
  if ("error" in values) return values;

  const supabase = await createClient();
  const { error } = await supabase.from("rate_groups").insert({ school_id: membership.schoolId, ...values });
  if (error?.code === "23505") return { error: `Satsen "${values.name}" findes allerede.` };
  if (error) return { error: "Satsen kunne ikke oprettes. Prøv igen." };

  refresh();
  redirect(PAGE);
}

export async function updateRateGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const values = readRateGroup(formData);
  if ("error" in values) return values;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rate_groups")
    .update({ ...values, active: formData.get("active") === "on" })
    .eq("id", text(formData, "id"))
    .eq("school_id", membership.schoolId)
    .select("id");
  if (error?.code === "23505") return { error: `Satsen "${values.name}" findes allerede.` };
  if (error || !data?.length) return { error: "Satsen kunne ikke gemmes. Prøv igen." };

  refresh();
  return { message: "Satsen er gemt." };
}

export async function deleteRateGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("rate_groups")
    .delete()
    .eq("id", text(formData, "id"))
    .eq("school_id", membership.schoolId);
  if (error?.code === "23503") return { error: "Satsen har ydelser og kan kun slås fra." };
  if (error) return { error: "Satsen kunne ikke slettes. Prøv igen." };

  refresh();
  redirect(PAGE);
}

// ---------------------------------------------------------------------------
// Ydelser
// ---------------------------------------------------------------------------
function readPrice(formData: FormData): { error: string } | { amount_ore: number; valid_from: string } {
  const raw = text(formData, "price");
  const ore = parseKroner(raw);
  if (ore === null) return { error: "Skriv en pris." };
  if (Number.isNaN(ore)) return { error: `"${raw}" er ikke et gyldigt beløb.` };
  const validFrom = parseDateInput(text(formData, "validFrom"));
  if (!validFrom) return { error: "Vælg den dato, prisen gælder fra." };
  return { amount_ore: ore, valid_from: validFrom };
}

export async function createService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const schoolId = membership.schoolId;
  const name = text(formData, "name");
  const rateGroupId = text(formData, "rateGroupId");
  const category = text(formData, "category");
  const lessonTypeId = text(formData, "lessonTypeId");
  if (!name) return { error: "Skriv et navn." };
  if (name.length > 40) return { error: "Navnet er for langt." };
  if (!rateGroupId) return { error: "Vælg en sats." };
  if (!category) return { error: "Vælg en kategori." };
  if (!lessonTypeId) return { error: "Vælg en type." };
  const price = readPrice(formData);
  if ("error" in price) return price;

  const supabase = await createClient();
  const { data: service, error } = await supabase
    .from("services")
    .insert({ school_id: schoolId, name, rate_group_id: rateGroupId, category_code: category, lesson_type_id: lessonTypeId })
    .select("id")
    .single();
  if (error?.code === "23505") return { error: `Ydelsen "${name}" findes allerede.` };
  if (error || !service) return { error: "Ydelsen kunne ikke oprettes. Prøv igen." };

  const { error: priceError } = await supabase
    .from("service_prices")
    .insert({ school_id: schoolId, service_id: service.id, ...price });
  if (priceError) {
    await supabase.from("services").delete().eq("id", service.id);
    return { error: "Ydelsen kunne ikke oprettes. Prøv igen." };
  }

  refresh();
  redirect(`${PAGE}/${service.id}`);
}

export async function updateService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const name = text(formData, "name");
  if (!name) return { error: "Skriv et navn." };
  if (name.length > 40) return { error: "Navnet er for langt." };

  const changes: Record<string, string | boolean> = {
    name,
    rate_group_id: text(formData, "rateGroupId"),
    active: formData.get("active") === "on",
  };
  // Kategori og type sendes kun, når ydelsen ikke er brugt (felterne er ellers låst).
  if (formData.has("category")) changes.category_code = text(formData, "category");
  if (formData.has("lessonTypeId")) changes.lesson_type_id = text(formData, "lessonTypeId");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .update(changes)
    .eq("id", text(formData, "id"))
    .eq("school_id", membership.schoolId)
    .select("id");
  if (error?.code === "23505") return { error: `Ydelsen "${name}" findes allerede.` };
  if (error?.code === "23514") return { error: error.message };
  if (error || !data?.length) return { error: "Ydelsen kunne ikke gemmes. Prøv igen." };

  refresh();
  return { message: "Ydelsen er gemt." };
}

export async function deleteService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", text(formData, "id"))
    .eq("school_id", membership.schoolId);
  if (error?.code === "23503") return { error: "Ydelsen er brugt på lektioner og kan kun slås fra." };
  if (error) return { error: "Ydelsen kunne ikke slettes. Prøv igen." };

  refresh();
  redirect(PAGE);
}

// ---------------------------------------------------------------------------
// Priser
// ---------------------------------------------------------------------------

// Ny pris fra en dato. Findes der allerede en pris på datoen, erstattes den.
export async function addPrice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const price = readPrice(formData);
  if ("error" in price) return price;

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_prices")
    .upsert(
      { school_id: membership.schoolId, service_id: text(formData, "serviceId"), ...price },
      { onConflict: "service_id,valid_from" },
    );
  if (error) return { error: "Prisen kunne ikke gemmes. Prøv igen." };

  refresh();
  return { message: `${formatKroner(price.amount_ore)} gælder fra ${formatDate(price.valid_from)}.` };
}

export async function deletePrice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_prices")
    .delete()
    .eq("id", text(formData, "id"))
    .eq("school_id", membership.schoolId)
    .select("id");
  if (error?.code === "23514") return { error: "En ydelse skal have mindst én pris." };
  if (error || !data?.length) return { error: "Prisen kunne ikke slettes. Prøv igen." };

  refresh();
  return { message: "Prisen er slettet." };
}
