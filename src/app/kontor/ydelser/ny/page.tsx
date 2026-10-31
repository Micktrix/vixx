import Link from "next/link";
import { ActionForm } from "@/components/form";
import { requireRole } from "@/lib/auth/session";
import { todayDk } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { createService } from "../actions";
import { BackHeader } from "../back-header";
import { PriceFields } from "../price-fields";
import { ServiceFields } from "../service-fields";

export default async function NewServicePage() {
  const { membership } = await requireRole(["admin"]);
  const supabase = await createClient();
  const { count } = await supabase
    .from("rate_groups")
    .select("id", { count: "exact", head: true })
    .eq("school_id", membership.schoolId)
    .eq("active", true);

  return (
    <>
      <BackHeader title="Ny ydelse" />
      <section className="rounded-[20px] border border-line bg-surface p-[18px]">
        {count ? (
          <ActionForm action={createService} submitLabel="Opret ydelse" pendingLabel="Opretter …" className="flex flex-col gap-5">
            <ServiceFields schoolId={membership.schoolId} />
            <PriceFields today={todayDk()} />
          </ActionForm>
        ) : (
          <p>
            Opret først en sats.{" "}
            <Link href="/kontor/ydelser/satser/ny" className="font-semibold text-accent-ink underline underline-offset-[3px]">
              Ny sats
            </Link>
          </p>
        )}
      </section>
    </>
  );
}
