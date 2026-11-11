import { sendAllBackups } from "@/lib/backup-send";

// Natlig backup af timer (Vercel Cron, se vercel.json). Vercel sender CRON_SECRET som Bearer-token;
// uden den gyldige nøgle sker der intet.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Ingen adgang", { status: 401 });
  }
  const results = await sendAllBackups();
  return Response.json({ sent: results.filter((r) => !r.error).length, failed: results.filter((r) => r.error).length });
}
