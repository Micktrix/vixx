import { notFound } from "next/navigation";
import { ActionForm } from "@/components/form";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { deleteRateGroup, updateRateGroup } from "../../actions";
import { BackHeader } from "../../back-header";
import { RateGroupFields } from "../../rate-group-fields";

export default async function RateGroupPage({ params }: PageProps<"/kontor/ydelser/satser/[id]">) {
  const { id } = await params;
  const { membership } = await requireRole(["admin"]);
  const supabase = await createClient();
  const [{ data: group }, { count }] = await Promise.all([
    supabase.from("rate_groups").select("id, name, payroll_code, active").eq("id", id).eq("school_id", membership.schoolId).maybeSingle(),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("rate_group_id", id),
  ]);
  if (!group) notFound();

  return (
    <>
      <BackHeader title={group.name} />
      <section className="rounded-[20px] border border-line bg-surface p-[18px]">
        <ActionForm action={updateRateGroup} submitLabel="Gem">
          <input type="hidden" name="id" value={group.id} />
          <RateGroupFields name={group.name} payrollCode={group.payroll_code} />
          <label className="flex items-center gap-2.5 text-[15px]">
            <input type="checkbox" name="active" defaultChecked={group.active} className="size-[18px] accent-accent" />
            I brug
          </label>
          <p className="text-[13px] text-muted">
            En sats, der ikke er i brug, kan ikke vælges på nye ydelser, og dens ydelser vises ikke ved planlægning.
          </p>
        </ActionForm>
      </section>

      {count ? (
        <p className="text-[13px] text-muted">Satsen har {count} ydelse{count === 1 ? "" : "r"} og kan kun slås fra, ikke slettes.</p>
      ) : (
        <ActionForm
          action={deleteRateGroup}
          submitLabel="Slet sats"
          pendingLabel="Sletter …"
          confirmText={`Slet satsen ${group.name}?`}
          primary={false}
        >
          <input type="hidden" name="id" value={group.id} />
        </ActionForm>
      )}
    </>
  );
}
