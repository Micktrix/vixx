import { createClient } from "@/lib/supabase/server";

// Deltageren svarer på det åbne spørgsmål.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string; choice?: number };
  const supabase = await createClient();
  const { error } = await supabase.rpc("quiz_answer", { p_token: String(body.token ?? ""), p_choice: Number(body.choice) });
  if (error) {
    const known = ["23514", "23505", "42501"].includes(error.code ?? "");
    return Response.json({ error: known ? error.message : "Svaret kom ikke igennem. Prøv igen." }, { status: 400 });
  }
  return Response.json({ ok: true });
}
