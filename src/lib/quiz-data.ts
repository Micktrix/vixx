import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type QuizSummary = { id: string; title: string; shared: boolean; ownerId: string; ownerName: string; questions: number };
export type QuizQuestion = {
  id: string;
  position: number;
  text: string;
  imagePath: string | null;
  answers: string[];
  correct: number;
  timeLimit: number;
};

// Egne quizzer og skolens delte quizzer (RLS).
export async function loadQuizzes(schoolId: string): Promise<QuizSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quizzes")
    .select("id, title, shared, owner_id, owner_name, quiz_questions(count)")
    .eq("school_id", schoolId)
    .order("updated_at", { ascending: false });
  return (data ?? []).map((q) => ({
    id: q.id,
    title: q.title,
    shared: q.shared,
    ownerId: q.owner_id,
    ownerName: q.owner_name,
    questions: (q.quiz_questions as unknown as { count: number }[])?.[0]?.count ?? 0,
  }));
}

export async function loadQuiz(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quizzes")
    .select("id, school_id, title, shared, owner_id, owner_name, quiz_questions(id, position, text, image_path, answers, correct, time_limit, created_at)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  type Row = { id: string; position: number; text: string; image_path: string | null; answers: string[]; correct: number; time_limit: number; created_at: string };
  const questions = ((data.quiz_questions ?? []) as Row[])
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
    .map((q): QuizQuestion => ({ id: q.id, position: q.position, text: q.text, imagePath: q.image_path, answers: q.answers, correct: q.correct, timeLimit: q.time_limit }));
  return { id: data.id, schoolId: data.school_id, title: data.title, shared: data.shared, ownerId: data.owner_id, ownerName: data.owner_name, questions };
}

// Billeder til spørgsmål ligger i fillageret "materials" og vises via et link, der virker en time.
export async function imageUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await createAdminClient().storage.from("materials").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// Farver og bogstaver til svarene (også for farveblinde: bogstav + farve).
export const ANSWER_STYLES = [
  { letter: "A", className: "bg-[#c0392b] text-white" },
  { letter: "B", className: "bg-[#2471a3] text-white" },
  { letter: "C", className: "bg-[#b7950b] text-white" },
  { letter: "D", className: "bg-[#1e8449] text-white" },
] as const;
