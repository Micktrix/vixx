import { teacherCalendar } from "@/lib/teacher-calendar";

// Kalenderfil til telefonens kalender: /kalender/<hemmeligt link>.ics. Kræver ikke login; linket er nøglen.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ics = await teacherCalendar(token.replace(/\.ics$/, ""));
  if (!ics) return new Response("Kalenderen findes ikke.", { status: 404 });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="vixx.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
