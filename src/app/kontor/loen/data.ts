import "server-only";
import type { PayPeriod } from "@/lib/pay-period";
import type { PayrollInstructor, PayrollRegistration } from "@/lib/payroll";
import { createClient } from "@/lib/supabase/server";

type Row = {
  instructor_id: string;
  status: PayrollRegistration["status"];
  lesson_count: number;
  unit_price_ore: number | null;
  service_id: string;
  services: { name: string; payroll_code: string | null } | null;
  instructors: {
    employee_number: string | null;
    is_guest: boolean;
    school_members: { profiles: { full_name: string } | null } | null;
  } | null;
};

// Alle registreringer i perioden med lærer og ydelse (navn og løndel). unit_price_ore er den låste pris for godkendte.
export async function loadPayroll(schoolId: string, period: PayPeriod) {
  const supabase = await createClient();
  const [{ data }, { data: periodRow }] = await Promise.all([
    supabase
      .from("registrations")
      .select(
        "instructor_id, status, lesson_count, unit_price_ore, service_id, services(name, payroll_code), instructors(employee_number, is_guest, school_members(profiles(full_name)))",
      )
      .eq("school_id", schoolId)
      .gte("lesson_date", period.start)
      .lte("lesson_date", period.end)
      .neq("status", "rejected"),
    supabase
      .from("pay_periods")
      .select("locked, locked_by, locked_at")
      .eq("school_id", schoolId)
      .eq("starts_on", period.start)
      .maybeSingle(),
  ]);

  const rows = (data ?? []) as unknown as Row[];
  const instructors = new Map<string, PayrollInstructor>();
  const registrations: PayrollRegistration[] = rows.map((r) => {
    if (!instructors.has(r.instructor_id)) {
      instructors.set(r.instructor_id, {
        id: r.instructor_id,
        name: r.instructors?.school_members?.profiles?.full_name ?? "",
        employeeNumber: r.instructors?.employee_number ?? null,
        isGuest: !!r.instructors?.is_guest,
      });
    }
    return {
      instructorId: r.instructor_id,
      status: r.status,
      count: r.lesson_count,
      unitPriceOre: r.unit_price_ore,
      serviceId: r.service_id,
      serviceName: r.services?.name ?? "",
      payrollCode: r.services?.payroll_code ?? null,
    };
  });

  let lockedByName: string | null = null;
  if (periodRow?.locked_by) {
    const { data: p } = await supabase.from("profiles").select("full_name").eq("id", periodRow.locked_by).maybeSingle();
    lockedByName = p?.full_name ?? null;
  }

  return {
    instructors: [...instructors.values()],
    registrations,
    locked: !!periodRow?.locked,
    lockedAt: periodRow?.locked_at ?? null,
    lockedByName,
  };
}
