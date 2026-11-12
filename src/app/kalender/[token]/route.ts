import { studentCalendar } from "@/lib/student-calendar";
import { teacherCalendar } from "@/lib/teacher-calendar";

// Kalenderfil til telefonens kalender: /kalender/<hemmeligt link>.ics, for en lærer eller en elev. Kræver ikke
// login; linket er nøglen.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const key = token.replace(/\.ics$/, "");
  const ics = (await teacherCalendar(key)) ?? (await studentCalendar(key));
  if (!ics) return new Response("Kalenderen findes ikke.", { status: 404 });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="vixx.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
