// Kontorets menu. `slug` er null for forsiden (/kontor). Indstillinger har en undermenu.
export type OfficeSection = {
  slug: string | null;
  label: string;
  icon: "calendar" | "check" | "user" | "chart" | "tag" | "sun" | "message" | "list" | "settings" | "room" | "car" | "screen";
  children?: OfficeSection[];
};

export const officeSections: OfficeSection[] = [
  { slug: null, label: "Kalender", icon: "calendar" },
  { slug: "lokaler", label: "Lokaler", icon: "room" },
  { slug: "koeretoejer", label: "Køretøjer", icon: "car" },
  { slug: "godkendelser", label: "Godkendelser", icon: "check" },
  { slug: "loen", label: "Lønoverblik", icon: "chart" },
  { slug: "beskeder", label: "Beskeder", icon: "message" },
  { slug: "storskaerm", label: "Storskærm", icon: "screen" },
  {
    slug: "indstillinger",
    label: "Indstillinger",
    icon: "settings",
    children: [
      { slug: "indstillinger", label: "Generelt", icon: "settings" },
      { slug: "undervisere", label: "Undervisere", icon: "user" },
      { slug: "ydelser", label: "Ydelser og satser", icon: "tag" },
      { slug: "ferie", label: "Ferie", icon: "sun" },
      { slug: "log", label: "Ændringslog", icon: "list" },
    ],
  },
];

// Storskærmen er en fuldskærmsside uden kontorets menu.
export const officeHref = (s: OfficeSection) =>
  s.slug === "storskaerm" ? "/storskaerm" : s.slug ? `/kontor/${s.slug}` : "/kontor";
