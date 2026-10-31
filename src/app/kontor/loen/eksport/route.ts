import { requireRole } from "@/lib/auth/session";
import { parseDateInput, todayDk } from "@/lib/dates";
import { periodFor } from "@/lib/pay-period";
import { exportLines, toDatalonCsv } from "@/lib/payroll";
import { createClient } from "@/lib/supabase/server";
import { loadPayroll } from "../data";

// Dataløn-eksport som CSV-fil: godkendte lektioner i perioden, uden gæstelærere.
export async function GET(request: Request) {
  const { membership } = await requireRole(["admin", "office"]);
  const supabase = await createClient();
  const { data: school } = await supabase.from("schools").select("pay_period_start_day").eq("id", membership.schoolId).single();
  const asked = parseDateInput(new URL(request.url).searchParams.get("periode") ?? "") ?? todayDk();
  const period = periodFor(asked, school?.pay_period_start_day ?? 21);

  const { instructors, registrations } = await loadPayroll(membership.schoolId, period);
  // BOM, så Excel og Dataløn læser æ, ø og å rigtigt.
  const csv = "﻿" + toDatalonCsv(exportLines(instructors, registrations));

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="dataloen-${period.start}-${period.end}.csv"`,
      "cache-control": "no-store",
    },
  });
}
