// Kontorets menupunkter i Fase 1. `slug` er null for forsiden (/kontor).
export type OfficeSection = {
  slug: string | null;
  label: string;
  icon: "calendar" | "check" | "user" | "chart" | "tag" | "sun" | "message" | "list" | "settings" | "room" | "car" | "screen";
};

export const officeSections: OfficeSection[] = [
  { slug: null, label: "Kalender", icon: "calendar" },
  { slug: "lokaler", label: "Lokaler", icon: "room" },
  { slug: "koeretoejer", label: "Køretøjer", icon: "car" },
  { slug: "godkendelser", label: "Godkendelser", icon: "check" },
  { slug: "undervisere", label: "Undervisere", icon: "user" },
  { slug: "loen", label: "Lønoverblik", icon: "chart" },
  { slug: "ydelser", label: "Ydelser og satser", icon: "tag" },
  { slug: "ferie", label: "Ferie", icon: "sun" },
  { slug: "beskeder", label: "Beskeder", icon: "message" },
  { slug: "log", label: "Ændringslog", icon: "list" },
  { slug: "storskaerm", label: "Storskærm", icon: "screen" },
  { slug: "indstillinger", label: "Indstillinger", icon: "settings" },
];

// Storskærmen er en fuldskærmsside uden kontorets menu.
export const officeHref = (s: OfficeSection) =>
  s.slug === "storskaerm" ? "/storskaerm" : s.slug ? `/kontor/${s.slug}` : "/kontor";

