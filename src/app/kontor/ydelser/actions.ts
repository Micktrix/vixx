"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { formatDate, parseDateInput } from "@/lib/dates";
import { formatKroner, parseKroner } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

// Kun admin ændrer ydelser og satser (RLS håndhæver det også).
// Alt kører som den indloggede bruger, så ændringsloggen viser hvem.

const PAGE = "/kontor/ydelser";

function refresh() {
  revalidatePath(PAGE, "layout");
  revalidatePath("/kontor/undervisere", "layout");
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

// ---------------------------------------------------------------------------
// Ydelser
// ---------------------------------------------------------------------------
// Satsen er beløbet pr. lektion med en gyldig-fra-dato (tabellen service_prices).
function readPrice(formData: FormData): { error: string } | { amount_ore: number; valid_from: string } {
  const raw = text(formData, "price");
  const ore = parseKroner(raw);
  if (ore === null) return { error: "Skriv en sats." };
  if (Number.isNaN(ore)) return { error: `"${raw}" er ikke et gyldigt beløb.` };
  const validFrom = parseDateInput(text(formData, "validFrom"));
  if (!validFrom) return { error: "Vælg den dato, satsen gælder fra." };
  return { amount_ore: ore, valid_from: validFrom };
}

function readService(formData: FormData): { error: string } | { name: string; payroll_code: string | null } {
  const name = text(formData, "name");
  const payrollCode = text(formData, "payrollCode") || null;
  if (!name) return { error: "Skriv et navn." };
  if (name.length > 40) return { error: "Navnet er for langt." };
  if (payrollCode && payrollCode.length > 20) return { error: "Løndelen er for lang." };
  return { name, payroll_code: payrollCode };
}

export async function createService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const schoolId = membership.schoolId;
  const values = readService(formData);
  if ("error" in values) return values;
  const price = readPrice(formData);
  if ("error" in price) return price;

  const supabase = await createClient();
  const { data: service, error } = await supabase
    .from("services")
    .insert({ school_id: schoolId, ...values })
    .select("id")
    .single();
  if (error?.code === "23505") return { error: `Ydelsen "${values.name}" findes allerede.` };
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
  const values = readService(formData);
  if ("error" in values) return values;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .update({ ...values, active: formData.get("active") === "on" })
    .eq("id", text(formData, "id"))
    .eq("school_id", membership.schoolId)
    .select("id");
  if (error?.code === "23505") return { error: `Ydelsen "${values.name}" findes allerede.` };
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
// Satser (beløb med gyldig-fra-dato)
// ---------------------------------------------------------------------------

// Ny sats fra en dato. Findes der allerede en sats på datoen, erstattes den.
export async function addPrice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { membership } = await requireRole(["admin"]);
  const price = readPrice(formData);
  if ("error" in price) return price;

  const supabase = await createClient();
  const { error } = await supabase.from("service_prices").upsert(
    {
      school_id: membership.schoolId,
      service_id: text(formData, "serviceId"),
      ...price,
    },
    { onConflict: "service_id,valid_from" },
  );
  if (error) return { error: "Satsen kunne ikke gemmes. Prøv igen." };

  refresh();
  return {
    message: `${formatKroner(price.amount_ore)} gælder fra ${formatDate(price.valid_from)}.`,
  };
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
  if (error?.code === "23514") return { error: "En ydelse skal have mindst én sats." };
  if (error || !data?.length) return { error: "Satsen kunne ikke slettes. Prøv igen." };

  refresh();
  return { message: "Satsen er slettet." };
}
