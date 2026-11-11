import { ActionForm } from "@/components/form";
import { requireRole } from "@/lib/auth/session";
import { todayDk } from "@/lib/dates";
import { createService } from "../actions";
import { BackHeader } from "../back-header";
import { PriceFields } from "../price-fields";
import { ServiceFields } from "../service-fields";

export default async function NewServicePage() {
  await requireRole(["admin"]);

  return (
    <>
      <BackHeader title="Ny ydelse" />
      <section className="rounded-[20px] border border-line bg-surface p-[18px]">
        <ActionForm
          action={createService}
          submitLabel="Opret ydelse"
          pendingLabel="Opretter …"
          className="flex flex-col gap-5"
        >
          <ServiceFields />
          <PriceFields today={todayDk()} />
        </ActionForm>
      </section>
    </>
  );
}
