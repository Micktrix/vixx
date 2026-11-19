"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Quizzer: lærere og kontor laver dem, retter dem og starter en runde på storskærmen. Databasen afgør
// adgangen (RLS og quiz_start); billeder lægges op via et tidsbegrænset link ligesom vidensbankens filer.

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

async function member() {
  const { membership } = await requireRole(["admin", "office", "instructor"]);
  return { schoolId: membership.schoolId, supabase: await createClient() };
}

function refresh(id?: string) {
  for (const base of ["/kontor/quiz", "/laerer/quiz"]) {
    revalidatePath(base);
    if (id) revalidatePath(`${base}/${id}`);
  }
}

function dbError(error: { code?: string; message: string } | null, fallback: string): ActionState {
  if (!error) return undefined;
  if (["23514", "23505"].includes(error.code ?? "")) return { error: error.message };
  if (error.code === "42501") return { error: "Du har ikke adgang til at ændre dette." };
  return { error: fallback };
}

export async function createQuiz(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, supabase } = await member();
  const title = text(formData, "title");
  if (!title) return { error: "Skriv en titel." };
  const { data, error } = await supabase.from("quizzes").insert({ school_id: schoolId, title, shared: formData.get("shared") === "on" }).select("id").single();
  const failed = dbError(error, "Quizzen kunne ikke oprettes. Prøv igen.");
  if (failed) return failed;
  refresh();
  redirect(`${text(formData, "base")}/${data!.id}`);
}

export async function updateQuiz(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await member();
  const id = text(formData, "id");
  const title = text(formData, "title");
  if (!title) return { error: "Skriv en titel." };
  const { data, error } = await supabase
    .from("quizzes")
    .update({ title, shared: formData.get("shared") === "on" })
    .eq("id", id)
    .select("id");
  const failed = dbError(error, "Quizzen kunne ikke gemmes. Prøv igen.");
  if (failed) return failed;
  if (!data?.length) return { error: "Du har ikke adgang til at rette denne quiz." };
  refresh(id);
  return { message: "Quizzen er gemt." };
}

export async function deleteQuiz(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await member();
  const { data, error } = await supabase.from("quizzes").delete().eq("id", text(formData, "id")).select("id");
  const failed = dbError(error, "Quizzen kunne ikke slettes.");
  if (failed) return failed;
  if (!data?.length) return { error: "Du har ikke adgang til at slette denne quiz." };
  refresh();
  redirect(text(formData, "base"));
}

// Gem et spørgsmål (nyt eller rettet). Billedet er allerede lagt op via prepareQuizImage.
export async function saveQuestion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, supabase } = await member();
  const quizId = text(formData, "quizId");
  const id = text(formData, "id") || null;
  const question = text(formData, "text");
  const answers = formData.getAll("answers").map((a) => String(a).trim()).filter(Boolean);
  const correctRaw = text(formData, "correct");
  const timeLimit = Number(text(formData, "timeLimit") || 20);
  if (!question) return { error: "Skriv spørgsmålet." };
  if (answers.length < 2) return { error: "Skriv mindst to svar." };
  if (correctRaw === "") return { error: "Markér det rigtige svar." };
  // Det rigtige svar er nummeret blandt de udfyldte svar (tomme felter springes over).
  const filled = formData.getAll("answers").map((a) => String(a).trim());
  const correct = filled.slice(0, Number(correctRaw) + 1).filter(Boolean).length - 1;
  if (!filled[Number(correctRaw)]) return { error: "Det rigtige svar må ikke være tomt." };
  const imagePath = text(formData, "imagePath") || null;
  const values = { text: question, answers, correct, time_limit: timeLimit, image_path: imagePath };

  const { error } = id
    ? await supabase.from("quiz_questions").update(values).eq("id", id).eq("quiz_id", quizId)
    : await supabase.from("quiz_questions").insert({
        ...values,
        school_id: schoolId,
        quiz_id: quizId,
        position: Number(text(formData, "position") || 0),
      });
  const failed = dbError(error, "Spørgsmålet kunne ikke gemmes. Prøv igen.");
  if (failed) return failed;
  refresh(quizId);
  return { message: "Spørgsmålet er gemt." };
}

export async function deleteQuestion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await member();
  const { data, error } = await supabase.from("quiz_questions").delete().eq("id", text(formData, "id")).select("quiz_id, image_path");
  const failed = dbError(error, "Spørgsmålet kunne ikke slettes.");
  if (failed) return failed;
  if (data?.[0]?.image_path) await createAdminClient().storage.from("materials").remove([data[0].image_path]);
  refresh(data?.[0]?.quiz_id);
  return undefined;
}

// Et link til at lægge et billede op til et spørgsmål (højst 5 MB, kun billeder).
export async function prepareQuizImage(input: { quizId: string; fileName: string; size: number; mimeType: string }): Promise<
  { error: string } | { path: string; signedUrl: string }
> {
  const { schoolId, supabase } = await member();
  if (!input.mimeType.startsWith("image/")) return { error: "Vælg et billede (fx JPG eller PNG)." };
  if (input.size > 5 * 1024 * 1024) return { error: "Billedet er for stort. Højst 5 MB." };
  const { data: quiz } = await supabase.from("quizzes").select("id").eq("id", input.quizId).maybeSingle();
  if (!quiz) return { error: "Quizzen findes ikke." };
  const safe = input.fileName.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-80) || "billede";
  const path = `${schoolId}/quiz/${input.quizId}/${randomUUID()}-${safe}`;
  const { data, error } = await createAdminClient().storage.from("materials").createSignedUploadUrl(path);
  if (error || !data) return { error: "Billedet kunne ikke lægges op. Prøv igen." };
  return { path, signedUrl: data.signedUrl };
}

// Start en runde og åbn storskærmsvisningen.
export async function startQuiz(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await member();
  const { data, error } = await supabase.rpc("quiz_start", { p_quiz: text(formData, "id") });
  const failed = dbError(error, "Quizzen kunne ikke startes. Prøv igen.");
  if (failed) return failed;
  const session = (data as { session_id: string }[])?.[0];
  if (!session) return { error: "Quizzen kunne ikke startes. Prøv igen." };
  redirect(`/quiz/vis/${session.session_id}`);
}
