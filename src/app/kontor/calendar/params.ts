import { parseDateInput, todayDk } from "@/lib/dates";

export type View = "dag" | "uge" | "maaned";

export type CalendarParams = { view: View; date: string; instructor: string | null };

export function readParams(sp: Record<string, string | string[] | undefined>): CalendarParams {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const view = one("vis");
  return {
    view: view === "uge" || view === "maaned" ? view : "dag",
    date: parseDateInput(one("dato") ?? "") ?? todayDk(),
    instructor: one("laerer") ?? null,
  };
}

export function calendarHref(p: Partial<CalendarParams> & { date: string; view: View }): string {
  const q = new URLSearchParams({ vis: p.view, dato: p.date });
  if (p.instructor) q.set("laerer", p.instructor);
  return `/kontor?${q}`;
}

export function absenceHref(p: { instructor?: string; date?: string; absence?: string }): string {
  const q = new URLSearchParams();
  if (p.absence) q.set("id", p.absence);
  if (p.instructor) q.set("laerer", p.instructor);
  if (p.date) q.set("dato", p.date);
  return `/kontor/fravaer?${q}`;
}

export function planHref(p: { instructor?: string; date?: string; start?: string; lesson?: string }): string {
  const q = new URLSearchParams();
  if (p.lesson) q.set("id", p.lesson);
  if (p.instructor) q.set("laerer", p.instructor);
  if (p.date) q.set("dato", p.date);
  if (p.start) q.set("start", p.start);
  return `/kontor/planlaeg?${q}`;
}
