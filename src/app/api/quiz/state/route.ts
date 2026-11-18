import { imageUrl } from "@/lib/quiz-data";
import { createClient } from "@/lib/supabase/server";

// Deltagerens skærm spørger her hvert sekund: status, spørgsmålet og egne point.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  if (!/^[0-9a-f-]{36}$/i.test(String(body.token ?? ""))) return Response.json({ state: null });
  const supabase = await createClient();
  const { data } = await supabase.rpc("quiz_player_state", { p_token: body.token });
  const state = data as { question?: { image_path?: string | null; image_url?: string | null } | null } | null;
  if (state?.question?.image_path) state.question.image_url = await imageUrl(state.question.image_path);
  if (state?.question) delete state.question.image_path;
  return Response.json({ state }, { headers: { "Cache-Control": "no-store" } });
}
