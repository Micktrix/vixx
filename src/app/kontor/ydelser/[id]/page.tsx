import { notFound } from "next/navigation";
import { Box } from "@/components/box";
import { ActionForm } from "@/components/form";
import { Pill } from "@/components/pill";
import { requireRole } from "@/lib/auth/session";
import { formatDate, todayDk } from "@/lib/dates";
import { formatKroner } from "@/lib/money";
import { priceOn } from "@/lib/prices";
import { createClient } from "@/lib/supabase/server";
import type { ServiceUsage } from "@/lib/prices";
import { addPrice, deletePrice, deleteService, updateService } from "../actions";
import { BackHeader } from "../back-header";
import { PriceFields } from "../price-fields";
import { ServiceFields } from "../service-fields";

export default async function ServicePage({ params }: PageProps<"/kontor/ydelser/[id]">) {
  const { id } = await params;
  const { membership } = await requireRole(["admin"]);
  const schoolId = membership.schoolId;
  const supabase = await createClient();
  const today = todayDk();

  const [{ data: service }, { data: prices }, { data: usageData }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, rate_group_id, lesson_type_id, active, service_categories(category_code)")
      .eq("id", id)
      .eq("school_id", schoolId)
      .maybeSingle(),
    supabase.from("service_prices").select("id, valid_from, amount_ore").eq("service_id", id).order("valid_from", { ascending: false }),
    supabase.rpc("service_usage", { p_school: schoolId }),
  ]);
  if (!service) notFound();

  const categories = (service.service_categories as { category_code: string }[]).map((c) => c.category_code);
  const uses = ((usageData ?? []) as ServiceUsage[]).find((u) => u.service_id === id)?.uses ?? 0;
  const current = priceOn(prices ?? [], today);

  return (
    <>
      <BackHeader title={service.name}>
        <p className="flex flex-wrap items-center gap-1.5 text-muted">
          {current ? `${formatKroner(current.amount_ore)} pr. lektion` : "Ingen pris i dag"}
          {service.active ? <Pill tone="ok">Aktiv</Pill> : <Pill>Slået fra</Pill>}
          <Pill>Brugt på {uses} lektion{uses === 1 ? "" : "er"}</Pill>
        </p>
      </BackHeader>

      <div className="grid gap-[18px] lg:grid-cols-2">
        <Box title="Ydelse">
          <ActionForm action={updateService} submitLabel="Gem" className="flex flex-col gap-5">
            <input type="hidden" name="id" value={service.id} />
            <ServiceFields schoolId={schoolId} service={{ ...service, categories }} locked={uses > 0} />
            <label className="flex items-center gap-2.5 text-[15px]">
              <input type="checkbox" name="active" defaultChecked={service.active} className="size-[18px] accent-accent" />
              I brug
            </label>
          </ActionForm>
        </Box>

        <Box title="Priser" hint="Godkendte lektioner ændres ikke">
          <ul className="flex flex-col">
            {(prices ?? []).map((p) => {
              const label = p.valid_from > today ? "Kommende" : p.id === current?.id ? "Gælder nu" : "Tidligere";
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
                  <span className="min-w-0">
                    <b>{formatKroner(p.amount_ore)}</b>
                    <span className="block text-sm text-muted">
                      Fra {formatDate(p.valid_from)}{" "}
                      <Pill tone={label === "Gælder nu" ? "ok" : label === "Kommende" ? "accent" : "neutral"}>{label}</Pill>
                    </span>
                  </span>
                  <span className="shrink-0">
                    {(prices ?? []).length > 1 && (
                      <ActionForm
                        action={deletePrice}
                        submitLabel="Slet"
                        pendingLabel="…"
                        confirmText={`Slet prisen ${formatKroner(p.amount_ore)} fra ${formatDate(p.valid_from)}?`}
                        primary={false}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="id" value={p.id} />
                      </ActionForm>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <h3 className="mt-2 text-[15px] font-bold">Ny pris</h3>
          <ActionForm action={addPrice} submitLabel="Gem ny pris">
            <input type="hidden" name="serviceId" value={service.id} />
            <PriceFields today={today} priceLabel="Ny pris pr. lektion (kr.)" />
          </ActionForm>
          <p className="text-[13px] text-muted">
            Den nye pris gælder for lektioner fra datoen. Findes der allerede en pris på datoen, erstattes den.
          </p>
        </Box>
      </div>

      {uses > 0 ? (
        <p className="text-[13px] text-muted">Ydelsen er brugt på lektioner og kan kun slås fra, ikke slettes.</p>
      ) : (
        <ActionForm
          action={deleteService}
          submitLabel="Slet ydelse"
          pendingLabel="Sletter …"
          confirmText={`Slet ydelsen ${service.name}?`}
          primary={false}
        >
          <input type="hidden" name="id" value={service.id} />
        </ActionForm>
      )}
    </>
  );
}
