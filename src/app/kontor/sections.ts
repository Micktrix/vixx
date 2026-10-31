// Kontorets menupunkter i Fase 1. `slug` er null for forsiden (/kontor).
export type OfficeSection = {
  slug: string | null;
  label: string;
  icon: "calendar" | "check" | "user" | "chart" | "tag" | "sun" | "message" | "list" | "settings";
};

export const officeSections: OfficeSection[] = [
  { slug: null, label: "Kalender", icon: "calendar" },
  { slug: "godkendelser", label: "Godkendelser", icon: "check" },
  { slug: "undervisere", label: "Undervisere", icon: "user" },
  { slug: "loen", label: "Lønoverblik", icon: "chart" },
  { slug: "ydelser", label: "Ydelser og satser", icon: "tag" },
  { slug: "ferie", label: "Ferie", icon: "sun" },
  { slug: "beskeder", label: "Beskeder", icon: "message" },
  { slug: "log", label: "Ændringslog", icon: "list" },
  { slug: "indstillinger", label: "Indstillinger", icon: "settings" },
];

export const officeHref = (s: OfficeSection) => (s.slug ? `/kontor/${s.slug}` : "/kontor");

