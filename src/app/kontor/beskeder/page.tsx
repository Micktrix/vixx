import { ActionForm } from "@/components/form";
import { Pill } from "@/components/pill";
import { inputClass } from "@/components/styles";
import { requireRole } from "@/lib/auth/session";
import { formatDate, todayDk } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { loadSchedule } from "../schedule-data";
import { sendMessage } from "./actions";

type MessageRow = {
  id: string;
  body: string;
  kind: "message" | "notification";
  recipient_instructor_id: string | null;
  sent_by: string | null;
  created_at: string;
  message_reads: { user_id: string }[];
};

export default async function OfficeMessagesPage() {
  const { membership } = await requireRole(["admin", "office"]);
  const supabase = await createClient();
  const today = todayDk();

  const [schedule, { data }] = await Promise.all([
    loadSchedule(membership.schoolId, today, today),
    supabase
      .from("messages")
      .select("id, body, kind, recipient_instructor_id, sent_by, created_at, message_reads(user_id)")
      .eq("school_id", membership.schoolId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const messages = (data ?? []) as unknown as MessageRow[];
  const names = new Map(schedule.instructors.map((i) => [i.id, i.name]));

  const senderIds = [...new Set(messages.map((m) => m.sent_by).filter((id): id is string => !!id))];
  const { data: senders } = senderIds.length ? await supabase.from("profiles").select("id, full_name").in("id", senderIds) : { data: [] };
  const senderName = new Map((senders ?? []).map((p) => [p.id, p.full_name]));

  return (
    <>
      <header>
        <p className="text-sm text-muted">Kontor</p>
        <h1 className="text-[30px] font-bold">Beskeder</h1>
        <p className="text-muted">Beskeder vises i lærer-appen under Beskeder.</p>
      </header>

      <div className="grid gap-[18px] lg:grid-cols-[1fr_1.4fr]">
        <section className="self-start rounded-[20px] border border-line bg-surface p-[18px]">
          <h2 className="mb-3 text-lg font-bold">Ny besked</h2>
          <ActionForm action={sendMessage} submitLabel="Send" pendingLabel="Sender …">
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Til
              <select name="to" defaultValue="all" className={inputClass}>
                <option value="all">Alle undervisere</option>
                {schedule.instructors.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Besked
              <textarea
                name="body"
                required
                rows={5}
                maxLength={1000}
                placeholder="Fx husk at registrere dine lektioner inden fredag"
                className="w-full rounded-[10px] border border-line2 bg-surface px-3 py-2 font-normal"
              />
            </label>
          </ActionForm>
        </section>

        <section className="rounded-[20px] border border-line bg-surface">
          <h2 className="border-b border-line px-[18px] py-3 text-lg font-bold">Sendte beskeder</h2>
          <ul>
            {messages.map((m) => {
              const toAll = !m.recipient_instructor_id;
              const reads = m.message_reads.length;
              return (
                <li key={m.id} className="flex flex-col gap-1 border-b border-line px-[18px] py-3 last:border-b-0" data-testid="sent-message">
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <b>{toAll ? "Alle undervisere" : (names.get(m.recipient_instructor_id!) ?? "Underviser")}</b>
                    {m.kind === "notification" && <Pill>Automatisk</Pill>}
                    <span className="text-muted">
                      {formatDate(m.created_at.slice(0, 10))} · {m.sent_by ? (senderName.get(m.sent_by) ?? "Kontoret") : "Kontoret"}
                    </span>
                  </span>
                  <p className="whitespace-pre-line">{m.body}</p>
                  <span className="text-[13px] text-muted">
                    {toAll ? `Læst af ${reads} af ${schedule.instructors.length}` : reads ? "Læst" : "Ikke læst endnu"}
                  </span>
                </li>
              );
            })}
            {!messages.length && <li className="px-[18px] py-4 text-muted">Ingen sendte beskeder endnu.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
