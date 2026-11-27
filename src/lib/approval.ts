// Kontrol af en registrering mod skemaet, som i prototypen:
// matcher   = registreret fra en planlagt lektion med samme ydelse og antal (en planlagt lektion fra lektionsplanen
//             har ingen ydelse; læreren vælger den ved "Til løn", så her tæller kun antallet)
// afvigelse = registreret fra en planlagt lektion, men ydelse eller antal er ændret
// uplanlagt = ingen planlagt lektion
export type Flag = "matcher" | "afvigelse" | "uplanlagt";

export const FLAG_LABEL: Record<Flag, string> = {
  matcher: "Matcher skema",
  afvigelse: "Afviger",
  uplanlagt: "Uplanlagt",
};

export function flagFor(
  registration: { serviceId: string; count: number },
  planned: { serviceId: string | null; count: number } | null,
): Flag {
  if (!planned) return "uplanlagt";
  const sameService = planned.serviceId === null || planned.serviceId === registration.serviceId;
  return sameService && planned.count === registration.count ? "matcher" : "afvigelse";
}
