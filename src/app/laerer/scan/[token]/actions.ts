"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Lærerens scanning af eleven: bekræft lektioner i et modul (og afslut det) og registrér repetition. Det gælder kun
// elevens forløb; timen til lønnen registrerer læreren i kalenderen (lektioner og timer er adskilt, 18. nov. 2026).

function dbError(error: { code?: string; message: string } | null, fallback: string): ActionState {
  if (!error) return undefined;
  if (["23P01", "23514", "P0001"].includes(error.code ?? "")) return { error: error.message };
  if (error.code === "42501") return { error: "Du har ikke adgang til at kvittere for denne elev." };
  return { error: fallback };
}

// Én scanning (ombygning 21. nov. 2026): lektioner i modulet og evt. afslutning af modulet i samme tryk.
// Databasen gemmer alt eller intet og tjekker minimum, mørke (7.19), teori, rækkefølge og underskrift.
// Køreemnerne står med flueben fra start (7.19 dog ikke, når modulet har krav om mørke); dem uden flueben er
// ikke kørt. Det går ikke til lønnen: timen registrerer læreren i kalenderen.
export async function recordScan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["instructor"]);
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const kind = text("kind") === "theory" ? "theory" : "driving";
  const count = Number(text("count"));
  const complete = text("complete") === "1";
  const transferred = formData.get("transferred") === "on";
  if (!text("moduleId")) return { error: "Vælg modulet." };
  if (!Number.isInteger(count) || count < 0 || count > 8 || (count === 0 && !(complete && transferred))) return { error: "Vælg antal lektioner." };
  const driven = new Set(formData.getAll("driveTopic").map(String));
  const all = formData.getAll("allTopic").map(String);
  const darkTopic = text("darkTopic");
  const darkChecked = !!darkTopic && driven.has(darkTopic);
  if (kind === "driving" && darkChecked && text("darkRequired") === "1" && formData.get("darkConfirm") !== "on")
    return { error: "Bekræft, at der er kørt i mørke, eller fjern fluebenet ved 7.19." };
  const ktaTopic = text("ktaTopic");
  const ktaChecked = kind === "driving" && !!ktaTopic && driven.has(ktaTopic);
  if (ktaChecked && formData.get("ktaConfirm") !== "on")
    return { error: "Bekræft, at eleven har kørt på køreteknisk anlæg, eller fjern fluebenet ved afsnit 9." };
  if (complete && formData.get("declaration") !== "on") return { error: "Sæt flueben ved erklæringen." };
  if (text("selfStudy").length > 500) return { error: "Selvstudie er for langt." };
  const theory = text("theoryLessons");
  // Overskud til næste modul: kun når modulet afsluttes i samme scanning.
  const splitRaw = text("splitHere");
  // Mørke (7.19) bekræftet: den lektion tælles altid i dette modul.
  const here = complete && splitRaw !== "" ? Math.max(Number(splitRaw), kind === "driving" && ((darkChecked && text("darkRequired") === "1") || ktaChecked) && count > 0 ? 1 : 0) : count;
  if (!Number.isInteger(here) || here < 0 || here > count) return { error: "Vælg antal lektioner." };
  const nextDriven = new Set(formData.getAll("nextDriveTopic").map(String));
  const nextSkipped = formData.getAll("nextAllTopic").map(String).filter((t) => !nextDriven.has(t));
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_scan", {
    p_student: text("studentId"),
    p_module: text("moduleId"),
    p_kind: kind,
    p_count: here,
    p_skipped: kind === "driving" ? all.filter((t) => !driven.has(t)).join("\n") || null : null,
    p_dark: kind === "driving" && darkChecked,
    p_manual_gear: formData.get("manualGear") === "on",
    p_complete: complete,
    p_theory_lessons: complete && theory ? Number(theory) : null,
    p_started_on: complete && text("startedOn") ? text("startedOn") : null,
    p_self_study: complete ? text("selfStudy") || null : null,
    p_transferred: complete && transferred,
    p_next_count: count - here,
    p_next_skipped: kind === "driving" ? nextSkipped.join("\n") || null : null,
  });
  if (error?.code === "23505") return { error: "Modulet er allerede afsluttet." };
  const failed = dbError(error, "Scanningen kunne ikke gemmes. Prøv igen.");
  if (failed) return failed;
  revalidatePath("/laerer", "layout");
  revalidatePath("/kontor", "layout");
  revalidatePath("/elev", "layout");
  const q = new URLSearchParams({ n: String(here), k: kind, m: text("moduleNumber"), a: complete ? "1" : "0" });
  if (count > here) q.set("x", String(count - here));
  redirect(`/laerer/scan/${text("token")}?${q}`);
}

// Repetitionslektioner efter ikke bestået praktisk prøve (trin E8, del 5). Databasen kræver, at alle moduler
// er afsluttet, og at læreren har gemt sin underskrift, og sætter dato, navn og en kopi af underskriften på.
export async function registerRepetition(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, membership } = await requireRole(["instructor"]);
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const count = Number(text("count"));
  if (!Number.isInteger(count) || count < 1 || count > 12) return { error: "Vælg antal lektioner." };
  const supabase = await createClient();
  const { data: instructor } = await supabase.from("instructors").select("id").eq("school_id", membership.schoolId).eq("user_id", user.id).single();
  if (!instructor) return { error: "Du har ikke adgang til at registrere repetitionslektioner." };
  const { error } = await supabase.from("repetition_lessons").insert({
    school_id: membership.schoolId,
    student_id: text("studentId"),
    lesson_count: count,
    instructor_id: instructor.id,
  });
  const failed = dbError(error, "Repetitionslektionerne kunne ikke registreres. Prøv igen.");
  if (failed) return failed;
  revalidatePath("/laerer", "layout");
  revalidatePath("/kontor", "layout");
  revalidatePath("/elev", "layout");
  redirect(`/laerer/scan/${text("token")}?kvitteret=Repetition`);
}

// EU ved scanning (trin E9a): de gennemførte emner og evt. én køretime i ét tryk. Databasen tjekker, at emnerne
// hører til elevens EU-forløb, og sætter dato, navn og lærerens underskrift på.
export async function recordEuScan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["instructor"]);
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const topics = formData.getAll("topic").map(String);
  const drive = text("drive");
  const title = text("driveTitle");
  const lessons = Number(text("driveLessons") || "0");
  if (drive === "other" && (!title || title.length > 80)) return { error: "Skriv køretimens emne." };
  if (drive === "other" && (!Number.isInteger(lessons) || lessons < 1 || lessons > 8)) return { error: "Vælg antal køretimer." };
  if (!topics.length && !drive) return { error: "Vælg mindst ét emne eller en køretime." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_eu_scan", {
    p_student: text("studentId"),
    p_topics: topics,
    p_drive: drive && drive !== "other" ? drive : null,
    p_drive_title: drive === "other" ? title : null,
    p_drive_lessons: drive === "other" ? lessons : null,
  });
  if (error?.code === "23505") return { error: "Et af emnerne er allerede bekræftet." };
  const failed = dbError(error, "EU kunne ikke gemmes. Prøv igen.");
  if (failed) return failed;
  revalidatePath("/laerer", "layout");
  revalidatePath("/kontor", "layout");
  const parts = [topics.length ? `${topics.length} ${topics.length === 1 ? "emne" : "emner"}` : "", drive ? "1 køretime" : ""].filter(Boolean);
  redirect(`/laerer/scan/${text("token")}?${new URLSearchParams({ eu: parts.join(" og ") })}`);
}
