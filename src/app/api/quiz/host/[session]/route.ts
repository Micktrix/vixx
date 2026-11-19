import { getCurrentUser } from "@/lib/auth/session";
import { imageUrl } from "@/lib/quiz-data";
import { createClient } from "@/lib/supabase/server";

// Storskærmen (værten) spørger her hvert sekund og sender sine handlinger hertil. Kun værten ser runden (RLS).
export async function GET(_request: Request, { params }: { params: Promise<{ session: string }> }) {
  const { session: id } = await params;
  if (!(await getCurrentUser())) return Response.json({ error: "Log ind igen." }, { status: 401 });
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("quiz_sessions")
    .select("id, quiz_id, code, status, current_index, question_started_at, quizzes(title)")
    .eq("id", id)
    .maybeSingle();
  if (!session) return Response.json({ error: "Runden findes ikke." }, { status: 404 });

  const [{ data: questions }, { data: players }, { data: answers }] = await Promise.all([
    supabase.from("quiz_questions").select("id, text, image_path, answers, answer_images, correct, time_limit, position, created_at").eq("quiz_id", session.quiz_id),
    supabase.from("quiz_players").select("id, nickname, score, removed").eq("session_id", id).order("joined_at"),
    supabase.from("quiz_answers").select("question_id, player_id, choice, correct").eq("session_id", id),
  ]);
  const ordered = (questions ?? []).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  const q = session.current_index >= 0 ? ordered[session.current_index] : undefined;
  const active = (players ?? []).filter((p) => !p.removed);
  const current = (answers ?? []).filter((a) => a.question_id === q?.id && active.some((p) => p.id === a.player_id));
  const secondsLeft =
    q && session.question_started_at
      ? Math.max(0, Math.round(q.time_limit - (Date.now() - new Date(session.question_started_at).getTime()) / 1000))
      : null;

  // Efter quizzen: hvor stor en del af holdet svarede rigtigt på hvert spørgsmål.
  const results =
    session.status === "finished"
      ? ordered.map((x) => {
          const a = (answers ?? []).filter((y) => y.question_id === x.id);
          return { text: x.text, answered: a.length, correct: a.filter((y) => y.correct).length };
        })
      : null;

  return Response.json(
    {
      title: (session.quizzes as unknown as { title: string } | null)?.title ?? "",
      code: session.code,
      status: session.status,
      index: session.current_index,
      total: ordered.length,
      players: active.map((p) => ({ id: p.id, nickname: p.nickname, score: p.score })).sort((a, b) => b.score - a.score),
      question: q
        ? {
            text: q.text,
            answers: q.answers,
            imageUrl: await imageUrl(q.image_path),
            answerImageUrls: await Promise.all(((q.answer_images as string[] | null) ?? []).map((p) => imageUrl(p))),
            correct: session.status === "reveal" || session.status === "finished" ? q.correct : null,
            secondsLeft,
            answered: current.length,
            counts: q.answers.map((_: string, i: number) => current.filter((a) => a.choice === i).length),
          }
        : null,
      results,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ session: string }> }) {
  const { session: id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string; player?: string };
  const supabase = await createClient();
  const { error } = await supabase.rpc("quiz_host", { p_session: id, p_action: String(body.action ?? ""), p_player: body.player ?? null });
  if (error) return Response.json({ error: "Det lykkedes ikke. Prøv igen." }, { status: 400 });
  return Response.json({ ok: true });
}
