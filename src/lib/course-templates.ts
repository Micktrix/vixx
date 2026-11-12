// Skabeloner til forløb, så en skole ikke starter fra et tomt ark. Indholdet er tastet ind fra skolens
// lektionsplan på papir og kan rettes frit bagefter under Indstillinger → Forløb.

export type TemplateLesson = {
  number: string;
  kind: "driving" | "theory";
  lessonCount: number;
  location?: string;
  content: string; // én linje pr. punkt
  notes?: string;
  controlTopic?: string;
};

export type CourseTemplate = { id: string; category: string; label: string; lessons: TemplateLesson[] };

const lines = (...l: string[]) => l.join("\n");

// C (lastbil). Lektion 2, 4, 6, 9, 11, 12, 13, 17 og 18 fra papiret; de øvrige tilføjes af skolen.
const C_LESSONS: TemplateLesson[] = [
  {
    number: "2",
    kind: "driving",
    lessonCount: 2,
    location: "Øvelsesstrækning (øvelsesplads/fabriksområde el. lign.)",
    content: lines(
      "2.1 Forberedelse til kørsel",
      "2.2 Lastbilens spejle",
      "2.3 Igangsætning og standsning ved kørebanekant",
      "2.4 Forlæns og baglæns højresving om hjørner",
      "2.5 Baglæns kørsel med målbremsning",
    ),
    controlTopic: "Bremser og styretøj",
  },
  {
    number: "4",
    kind: "driving",
    lessonCount: 2,
    location: "Øvelsesstrækning",
    content: lines(
      "1.1–1.6 Stikprøvevis kontrol mv. af køretøjets udstyr",
      "7.1 Igangsætning og standsning v. kantsten",
      "7.2 Placering under ligeudkørsel",
      "7.3 Hastighed under ligeudkørsel",
      "7.4 Vognbaneskift og sammenfletning",
      "7.5 Vending og baglænskørsel",
      "7.13 Højresving i mindre trafikerede kryds",
      "7.14 Venstresving i mindre trafikerede kryds",
      "7.15 Kørsel i rundkørsel",
    ),
    notes: "Samt repetition fra kategori B: 7.6 Kørsel forbi holdende, 7.7 Møde, 7.8 Kørsel foran eller efter andre, 7.11 Fremkørsel mod kryds, 7.12 Ligeudkørsel i kryds.",
    controlTopic: "Lygter og bærende dele",
  },
  {
    number: "6",
    kind: "driving",
    lessonCount: 2,
    location: "Øvelsesstrækning",
    content: lines(
      "1.1–1.7 Stikprøvevis kontrol mv. af køretøjets udstyr",
      "7.2 Placering under ligeudkørsel",
      "7.3 Hastighed under ligeudkørsel",
      "7.6 Kørsel forbi holdende køretøjer, gående mv.",
      "7.7 Møde",
      "7.8 Kørsel foran eller efter andre",
      "7.9 Overhaling",
    ),
    notes: "Samt repetition fra lektion 4.",
    controlTopic: "Motor og karosseri",
  },
  {
    number: "9",
    kind: "driving",
    lessonCount: 2,
    location: "Øvelsesstrækning",
    content: lines(
      "1.1–1.7 Stikprøvevis kontrol af køretøjets udstyr",
      "7.3 Landevejskørsel",
      "7.9 Overhaling",
      "7.15 Kørsel i (større) rundkørsler",
      "7.16 Kørsel på motorvej/(motortrafikvej)",
      "7.20 Kørsel i tunnel",
      "7.21 Kørsel ved letbane",
    ),
    controlTopic: "Vægttavler gennemgås",
  },
  {
    number: "11",
    kind: "driving",
    lessonCount: 2,
    location: "Øvelsesstrækning",
    content: lines("Stikprøvevis kontrol mv. af køretøjets udstyr", "7.17 Kørsel ved siden af andre (tæt trafik)"),
    notes:
      "Repetition af: 7.11 Fremkørsel mod kryds, 7.12 Ligeudkørsel i kryds, 7.13 Højresving i kryds, 7.14 Venstresving i kryds, 7.15 Kørsel i rundkørsel (mindre), 7.17 Kørsel ved siden af andre, 7.18 Standsning og parkering.",
    controlTopic: "Repetition af kontrolstof",
  },
  {
    number: "12",
    kind: "driving",
    lessonCount: 1,
    location: "Øvelsesstrækning",
    content: lines("1.1–1.7 Stikprøvevis kontrol", "7.19 Kørsel i mørke"),
  },
  {
    number: "13",
    kind: "driving",
    lessonCount: 1,
    location: "Øvelsesstrækning",
    content: lines("1.1–1.5 Stikprøvevis kontrol m.v. af køretøjets udstyr", "7.1–7.18 Repetition af foregående manøvrer"),
  },
  {
    number: "17",
    kind: "driving",
    lessonCount: 1,
    location: "Fri øvelsesstrækning",
    content: lines(
      "Evaluerende praktisk prøve",
      "Repetition og forberedelse til praktisk prøve",
      "7.2–7.18 Repetition af foregående manøvrer",
      "1.1–1.7 Stikprøvevis kontrol mv. af køretøjets udstyr",
    ),
  },
  {
    number: "18",
    kind: "driving",
    lessonCount: 1,
    location: "Fri øvelsesstrækning",
    content: lines(
      "Sidste kørsel inden aflæggelse af praktisk prøve, herunder stikprøvevis kontrol af køretøjets udstyr",
      "7.2–7.18 Repetition af foregående manøvrer",
    ),
    notes: "Lektionerne 17–18 kan, efter eget valg, gennemføres som 1 køreperiode (2 × 45 min.) eller som 2 køreperioder som anført.",
    controlTopic: "Repetition af kontrolstof",
  },
];

export const COURSE_TEMPLATES: CourseTemplate[] = [
  { id: "c-paper", category: "C", label: "C: lektion 2, 4, 6, 9, 11, 12, 13, 17 og 18 fra papiret", lessons: C_LESSONS },
];
