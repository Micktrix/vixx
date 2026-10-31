import { ActionForm } from "@/components/form";
import { requireRole } from "@/lib/auth/session";
import { createRateGroup } from "../../actions";
import { BackHeader } from "../../back-header";
import { RateGroupFields } from "../../rate-group-fields";

export default async function NewRateGroupPage() {
  await requireRole(["admin"]);
  return (
    <>
      <BackHeader title="Ny sats" />
      <section className="rounded-[20px] border border-line bg-surface p-[18px]">
        <ActionForm action={createRateGroup} submitLabel="Opret sats">
          <RateGroupFields />
        </ActionForm>
      </section>
    </>
  );
}
