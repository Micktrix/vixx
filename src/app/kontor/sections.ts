// Kontorets menu. `slug` er null for forsiden (/kontor). Indstillinger har en undermenu.
export type OfficeSection = {
  slug: string | null;
  label: string;
  icon: "calendar" | "check" | "user" | "chart" | "tag" | "sun" | "message" | "list" | "settings" | "room" | "car" | "screen";
  children?: OfficeSection[];
  desktopOnly?: boolean; // vises kun på computer (ikke i telefonens topbar)
  adminOnly?: boolean; // kontoret er som en lærer og ser ikke disse punkter
};

export const officeSections: OfficeSection[] = [
  { slug: null, label: "Kalender", icon: "calendar" },
  { slug: "elever", label: "Elever/hold", icon: "user" },
  { slug: "godkendelser", label: "Godkendelser", icon: "check", adminOnly: true },
  { slug: "lokaler", label: "Lokaler", icon: "room" },
  { slug: "koeretoejer", label: "Køretøjer", icon: "car" },
  { slug: "loen", label: "Lønoverblik", icon: "chart", adminOnly: true },
  { slug: "beskeder", label: "Beskeder", icon: "message" },
  { slug: "materialer", label: "Materialer", icon: "list", desktopOnly: true },
  { slug: "quiz", label: "Quiz", icon: "check", desktopOnly: true },
  { slug: "storskaerm", label: "Storskærm", icon: "screen", adminOnly: true },
  {
    slug: "indstillinger",
    label: "Indstillinger",
    icon: "settings",
    adminOnly: true,
    children: [
      { slug: "indstillinger", label: "Generelt", icon: "settings" },
      { slug: "undervisere", label: "Undervisere", icon: "user" },
      { slug: "ydelser", label: "Ydelser og satser", icon: "tag" },
      { slug: "forloeb", label: "Forløb", icon: "list" },
      { slug: "ferie", label: "Ferie", icon: "sun" },
      { slug: "log", label: "Ændringslog", icon: "list" },
    ],
  },
];

// Storskærmen er en fuldskærmsside uden kontorets menu.
export const officeHref = (s: OfficeSection) =>
  s.slug === "storskaerm" ? "/storskaerm" : s.slug ? `/kontor/${s.slug}` : "/kontor";
