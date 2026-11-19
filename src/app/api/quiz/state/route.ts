import { imageUrl } from "@/lib/quiz-data";
import { createClient } from "@/lib/supabase/server";

// Deltagerens skærm spørger her hvert sekund: status, spørgsmålet og egne point.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  if (!/^[0-9a-f-]{36}$/i.test(String(body.token ?? ""))) return Response.json({ state: null });
  const supabase = await createClient();
  const { data } = await supabase.rpc("quiz_player_state", { p_token: body.token });
  type Q = { image_path?: string | null; image_url?: string | null; answer_images?: string[]; answer_image_urls?: (string | null)[] };
  const state = data as { question?: Q | null } | null;
  if (state?.question) {
    const q = state.question;
    q.image_url = await imageUrl(q.image_path);
    q.answer_image_urls = await Promise.all((q.answer_images ?? []).map((p) => imageUrl(p)));
    delete q.image_path;
    delete q.answer_images;
  }
  return Response.json({ state }, { headers: { "Cache-Control": "no-store" } });
}
