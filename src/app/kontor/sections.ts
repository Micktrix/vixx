// Kontorets menupunkter i Fase 1. `slug` er null for forsiden (/kontor).
export type OfficeSection = {
  slug: string | null;
  label: string;
  icon: "calendar" | "check" | "user" | "chart" | "tag" | "sun" | "message" | "list" | "settings";
  comingIn: string;
};

export const officeSections: OfficeSection[] = [
  { slug: null, label: "Kalender", icon: "calendar", comingIn: "trin 5" },
  { slug: "godkendelser", label: "Godkendelser", icon: "check", comingIn: "trin 7" },
  { slug: "undervisere", label: "Undervisere", icon: "user", comingIn: "trin 3" },
  { slug: "loen", label: "Lønoverblik", icon: "chart", comingIn: "trin 8" },
  { slug: "ydelser", label: "Ydelser og satser", icon: "tag", comingIn: "trin 4" },
  { slug: "ferie", label: "Ferie", icon: "sun", comingIn: "trin 5" },
  { slug: "beskeder", label: "Beskeder", icon: "message", comingIn: "trin 9" },
  { slug: "log", label: "Ændringslog", icon: "list", comingIn: "trin 9" },
  { slug: "indstillinger", label: "Indstillinger", icon: "settings", comingIn: "en senere version" },
];

export const officeHref = (s: OfficeSection) => (s.slug ? `/kontor/${s.slug}` : "/kontor");

export const sectionBySlug = (slug: string | null) => officeSections.find((s) => s.slug === slug)!;
