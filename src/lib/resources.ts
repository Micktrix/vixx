// Lokaler og køretøjer: hvad passer til en lektion? (Bruges både på serveren og i formularer.)
// Et køretøj passer, hvis det dækker en af lektionens kategorier (eller ingen kategorier har).
// Et lokale passer, hvis det bruges til lektionens type (eller ingen typer har).

export type ResourceKind = "room" | "vehicle";

export type ResourceInfo = {
  id: string;
  kind: ResourceKind;
  name: string;
  categories: string[]; // køretøjer: B, BE …
  lessonTypeIds: string[]; // lokaler: fx Teori
  typeNames: string[];
};

export function fitsLesson(r: ResourceInfo, lesson: { categories: string[]; lessonTypeId?: string } | null): boolean {
  if (!lesson) return true;
  if (r.kind === "vehicle") return !r.categories.length || r.categories.some((c) => lesson.categories.includes(c));
  return !r.lessonTypeIds.length || !lesson.lessonTypeId || r.lessonTypeIds.includes(lesson.lessonTypeId);
}

// "B, BE" for køretøjer, "Teori" for lokaler.
export const resourceDetail = (r: ResourceInfo) => (r.kind === "vehicle" ? r.categories : r.typeNames).join(", ");

// De lokaler/køretøjer, der skal tilbydes til en lektion. Er lektionens type en, et lokale bruges til
// (fx Teori), tilbydes lokaler; ellers køretøjer. Uden valgt ydelse vises alt.
export function resourcesForLesson<T extends ResourceInfo>(
  resources: T[],
  lesson: { categories: string[]; lessonTypeId?: string } | null,
): T[] {
  if (!lesson) return resources;
  const roomType = !!lesson.lessonTypeId && resources.some((r) => r.kind === "room" && r.lessonTypeIds.includes(lesson.lessonTypeId!));
  return resources.filter((r) => (r.kind === "room") === roomType && fitsLesson(r, lesson));
}
