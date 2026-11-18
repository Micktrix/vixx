import { createClient } from "@/lib/supabase/server";

// Deltager tilmelder sig en quiz med koden og et kaldenavn (også uden login). Svarer med deltagerens nøgle.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { code?: string; nickname?: string };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quiz_join", { p_code: String(body.code ?? ""), p_nickname: String(body.nickname ?? "") });
  if (error) {
    const known = ["23514", "23505"].includes(error.code ?? "");
    return Response.json({ error: known ? error.message : "Det lykkedes ikke. Prøv igen." }, { status: 400 });
  }
  return Response.json({ token: data });
}
