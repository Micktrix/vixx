// EU-lektionsplaner (trin E9a): emner med fast "faktisk anvendt tid" og køretimer. Læreren bekræfter ved scanning;
// eleven skriver under med kuglepen på den printede plan. Bruges ved scanning, hos kontoret og ved print.

export type EuTopic = {
  id: string;
  kind: "topic" | "drive";
  sort: number;
  code: string;
  goal: string | null;
  description: string | null;
  hours: number | null;
  lessons: number | null;
};
export type EuSignoff = {
  id: string;
  eu_topic_id: string | null;
  kind: "topic" | "drive";
  drive_title: string | null;
  lessons: number | null;
  signed_on: string;
  instructor_name: string;
};

export type EuProgress = {
  topics: (EuTopic & { done: EuSignoff | null })[];
  drives: { title: string; lessons: number; done: EuSignoff | null; topicId: string | null }[]; // faste først, så ekstra
  hoursDone: number;
  hoursTotal: number;
  driveLessons: number; // bekræftede køretimer á 45 min.
};

export const EU_TOPIC_FIELDS = "id, kind, sort, code, goal, description, hours, lessons";
export const EU_SIGNOFF_FIELDS = "id, eu_topic_id, kind, drive_title, lessons, signed_on, instructor_name";

export function euProgress(rows: EuTopic[], signoffs: EuSignoff[]): EuProgress {
  const sorted = [...rows].sort((a, b) => a.sort - b.sort);
  const topics = sorted
    .filter((t) => t.kind === "topic")
    .map((t) => ({ ...t, hours: t.hours == null ? null : Number(t.hours), done: signoffs.find((s) => s.kind === "topic" && s.eu_topic_id === t.id) ?? null }));
  const driveSignoffs = signoffs.filter((s) => s.kind === "drive").sort((a, b) => a.signed_on.localeCompare(b.signed_on));
  const used = new Set<string>();
  const fixed = sorted
    .filter((t) => t.kind === "drive")
    .map((t) => {
      const done = driveSignoffs.find((s) => s.eu_topic_id === t.id && !used.has(s.id)) ?? null;
      if (done) used.add(done.id);
      return { title: t.code, lessons: done?.lessons ?? t.lessons ?? 1, done, topicId: t.id };
    });
  const extra = driveSignoffs
    .filter((s) => !used.has(s.id))
    .map((s) => ({ title: s.drive_title ?? fixed.find((f) => f.topicId === s.eu_topic_id)?.title ?? "", lessons: s.lessons ?? 1, done: s, topicId: s.eu_topic_id }));
  return {
    topics,
    drives: [...fixed, ...extra],
    hoursDone: topics.reduce((n, t) => n + (t.done ? (t.hours ?? 0) : 0), 0),
    hoursTotal: topics.reduce((n, t) => n + (t.hours ?? 0), 0),
    driveLessons: driveSignoffs.reduce((n, s) => n + (s.lessons ?? 0), 0),
  };
}

// "12 t" / "–" (tom = skrives i hånden på planen).
export const hoursText = (h: number | null) => (h == null ? "–" : `${String(h).replace(".", ",")} t`);
