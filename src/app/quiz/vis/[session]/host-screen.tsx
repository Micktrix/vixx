"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type HostState = {
  title: string;
  code: string;
  status: "lobby" | "question" | "reveal" | "finished";
  index: number;
  total: number;
  players: { id: string; nickname: string; score: number }[];
  question: {
    text: string;
    answers: string[];
    imageUrl: string | null;
    correct: number | null;
    secondsLeft: number | null;
    answered: number;
    counts: number[];
  } | null;
  results: { text: string; answered: number; correct: number }[] | null;
};

const COLORS = ["bg-[#c0392b]", "bg-[#2471a3]", "bg-[#b7950b]", "bg-[#1e8449]"];
const LETTERS = ["A", "B", "C", "D"];
const big = "inline-flex h-14 items-center rounded-2xl border border-accent bg-accent px-7 text-xl font-bold text-ink disabled:opacity-60";

// Storskærmen: QR-kode og deltagere, spørgsmål med nedtælling, svarfordeling og pointtavle. Spørger serveren
// hvert sekund. Når tiden er gået, eller alle har svaret, vises svaret af sig selv.
export function HostScreen({ sessionId, code, joinUrl, qrSvg }: { sessionId: string; code: string; joinUrl: string; qrSvg: string }) {
  const [state, setState] = useState<HostState | null>(null);
  const [busy, setBusy] = useState(false);
  const revealing = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/quiz/host/${sessionId}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setState(await res.json());
  }, [sessionId]);

  const act = useCallback(
    async (action: string, player?: string) => {
      setBusy(true);
      await fetch(`/api/quiz/host/${sessionId}`, { method: "POST", body: JSON.stringify({ action, player }) }).catch(() => null);
      await load();
      setBusy(false);
    },
    [sessionId, load],
  );

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  // Vis svaret, når tiden er gået, eller alle har svaret.
  useEffect(() => {
    const q = state?.question;
    if (state?.status !== "question" || !q || revealing.current) return;
    if (q.secondsLeft === 0 || (state.players.length > 0 && q.answered >= state.players.length)) {
      revealing.current = true;
      setTimeout(() => void act("reveal").finally(() => (revealing.current = false)), 0);
    }
  }, [state, act]);

  if (!state) return <main className="flex min-h-dvh items-center justify-center text-2xl text-muted">Henter quizzen …</main>;
  const q = state.question;

  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-bg p-8" data-testid="quiz-host">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{state.title}</h1>
        <span className="text-xl text-muted">
          {state.status === "lobby" ? `${state.players.length} med` : state.status === "finished" ? "Slut" : `Spørgsmål ${state.index + 1} af ${state.total}`}
        </span>
      </header>

      {state.status === "lobby" && (
        <section className="grid flex-1 items-center gap-10 lg:grid-cols-[minmax(280px,420px)_1fr]">
          <div className="flex flex-col items-center gap-4 rounded-[28px] border border-line bg-surface p-6">
            <div className="w-full rounded-2xl bg-white p-3 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <p className="text-center text-lg">
              Scan koden, eller gå til <b>{joinUrl.replace(/^https?:\/\//, "").replace(/\/q\/.*$/, "/q")}</b>
            </p>
            <p className="text-5xl font-bold tracking-[0.2em]" data-testid="quiz-code">
              {code}
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold">Deltagere ({state.players.length})</h2>
            <ul className="flex flex-wrap gap-2" data-testid="quiz-players">
              {state.players.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => confirm(`Fjern ${p.nickname} fra quizzen?`) && void act("remove", p.id)}
                    title="Fjern deltager"
                    className="rounded-full border border-line bg-surface px-4 py-2 text-lg font-semibold"
                  >
                    {p.nickname}
                  </button>
                </li>
              ))}
            </ul>
            <div>
              <button type="button" disabled={busy || !state.players.length} onClick={() => void act("next")} className={big}>
                Start quizzen
              </button>
            </div>
          </div>
        </section>
      )}

      {(state.status === "question" || state.status === "reveal") && q && (
        <section className="flex flex-1 flex-col gap-5">
          <div className="flex items-start justify-between gap-6">
            <h2 className="text-4xl leading-tight font-bold">{q.text}</h2>
            {state.status === "question" && (
              <span className="flex size-24 shrink-0 items-center justify-center rounded-full bg-accent text-4xl font-bold" data-testid="quiz-timer">
                {q.secondsLeft}
              </span>
            )}
          </div>
          {q.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={q.imageUrl} alt="" className="mx-auto max-h-[38vh] rounded-2xl object-contain" />
          )}
          <div className="grid flex-1 gap-4 sm:grid-cols-2">
            {q.answers.map((a, i) => {
              const right = state.status === "reveal" && q.correct === i;
              const wrong = state.status === "reveal" && q.correct !== i;
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between gap-4 rounded-2xl px-6 py-5 text-2xl font-bold text-white ${COLORS[i]} ${wrong ? "opacity-35" : ""} ${right ? "ring-8 ring-ok/60" : ""}`}
                >
                  <span>
                    {LETTERS[i]}. {a}
                  </span>
                  {state.status === "reveal" && <span className="text-3xl">{q.counts[i]}</span>}
                </div>
              );
            })}
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-xl text-muted">
              {q.answered} af {state.players.length} har svaret
            </span>
            {state.status === "question" ? (
              <button type="button" disabled={busy} onClick={() => void act("reveal")} className={big}>
                Vis svaret
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => void act("next")} className={big}>
                {state.index + 1 >= state.total ? "Se resultatet" : "Næste spørgsmål"}
              </button>
            )}
          </footer>
          {state.status === "reveal" && <Leaderboard players={state.players.slice(0, 5)} />}
        </section>
      )}

      {state.status === "finished" && (
        <section className="flex flex-1 flex-col gap-6">
          <Leaderboard players={state.players.slice(0, 10)} final />
          {state.results && (
            <div className="rounded-[24px] border border-line bg-surface p-6" data-testid="quiz-results">
              <h2 className="mb-3 text-2xl font-bold">Sådan gik det pr. spørgsmål</h2>
              <ul className="flex flex-col gap-2 text-lg">
                {state.results.map((r, i) => (
                  <li key={i} className="flex justify-between gap-4 border-b border-line pb-2 last:border-b-0">
                    <span>
                      {i + 1}. {r.text}
                    </span>
                    <b className={r.answered && r.correct / r.answered < 0.5 ? "text-bad" : "text-ok"}>
                      {r.answered ? Math.round((r.correct / r.answered) * 100) : 0} % rigtige
                    </b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {state.status !== "finished" && (
        <div className="text-right">
          <button type="button" onClick={() => confirm("Afslut quizzen nu?") && void act("finish")} className="text-sm font-semibold text-muted underline">
            Afslut quiz
          </button>
        </div>
      )}
    </main>
  );
}

function Leaderboard({ players, final = false }: { players: { id: string; nickname: string; score: number }[]; final?: boolean }) {
  return (
    <div className="rounded-[24px] border border-line bg-surface p-6" data-testid="quiz-leaderboard">
      <h2 className="mb-3 text-2xl font-bold">{final ? "Vinderne" : "Pointtavle"}</h2>
      <ol className="flex flex-col gap-2 text-xl">
        {players.map((p, i) => (
          <li key={p.id} className="flex justify-between gap-4">
            <span>
              <b>{i + 1}.</b> {p.nickname}
            </span>
            <b>{p.score}</b>
          </li>
        ))}
      </ol>
    </div>
  );
}
