"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { inputClass, primaryButtonClass } from "@/components/styles";

type PlayerState = {
  nickname: string;
  removed: boolean;
  score: number;
  rank: number;
  status: "lobby" | "question" | "reveal" | "finished";
  index: number;
  total: number;
  question: { id: string; text: string; answers: string[]; image_url: string | null; seconds_left: number; correct: number | null } | null;
  answered: boolean;
  my_choice: number | null;
  my_correct: boolean | null;
  my_points: number | null;
} | null;

const COLORS = ["bg-[#c0392b]", "bg-[#2471a3]", "bg-[#b7950b]", "bg-[#1e8449]"];
const LETTERS = ["A", "B", "C", "D"];
const NICK = "vixx-quiz-nickname";
const CHANGED = "vixx-quiz-storage";

// Browserens lager (nøglen og sidste kaldenavn) læses uden for React, så siden også virker uden lager.
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // uden lager må man bare vælge kaldenavn igen
  }
  window.dispatchEvent(new Event(CHANGED));
};
const subscribe = (cb: () => void) => {
  window.addEventListener(CHANGED, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGED, cb);
    window.removeEventListener("storage", cb);
  };
};

// Deltageren på telefonen: vælg kaldenavn, svar med de store knapper, og se point. Nøglen gemmes i
// browseren, så man kan genindlæse siden uden at miste sin plads.
export function PlayerScreen({ code, loggedIn }: { code: string; loggedIn: boolean }) {
  const key = `vixx-quiz-${code}`;
  const token = useSyncExternalStore(subscribe, () => read(key), () => null);
  const lastNick = useSyncExternalStore(subscribe, () => read(NICK) ?? "", () => "");
  const [typed, setNickname] = useState<string | null>(null);
  const nickname = typed ?? lastNick;
  const [state, setState] = useState<PlayerState>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/quiz/state", { method: "POST", body: JSON.stringify({ token }), cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const { state: next } = (await res.json()) as { state: PlayerState };
    if (!next) write(key, null);
    setState(next);
  }, [token, key]);

  useEffect(() => {
    if (!token) return;
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [token, load]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    const res = await fetch("/api/quiz/join", { method: "POST", body: JSON.stringify({ code, nickname }) }).catch(() => null);
    const body = res ? await res.json() : { error: "Ingen forbindelse. Prøv igen." };
    setSending(false);
    if (!res?.ok || !body.token) return setError(body.error ?? "Det lykkedes ikke. Prøv igen.");
    write(NICK, nickname.trim());
    write(key, body.token);
  }

  async function answer(choice: number) {
    setSending(true);
    const res = await fetch("/api/quiz/answer", { method: "POST", body: JSON.stringify({ token, choice }) }).catch(() => null);
    if (res && !res.ok) setError(((await res.json()) as { error?: string }).error ?? "");
    setSending(false);
    void load();
  }

  const shell = (children: React.ReactNode) => (
    <main className="flex min-h-dvh flex-col gap-4 bg-bg p-5" data-testid="quiz-player">
      {children}
    </main>
  );

  if (!token) {
    return shell(
      <form onSubmit={join} className="mx-auto flex w-full max-w-[420px] flex-col gap-4 pt-10">
        <h1 className="text-3xl font-bold">Quiz {code}</h1>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Dit kaldenavn
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            required
            maxLength={20}
            autoComplete="off"
            placeholder="Fx Turbo-Tine"
            className={`${inputClass} text-lg`}
          />
        </label>
        <p className="text-sm text-muted">
          Kun dit kaldenavn vises på skærmen.{loggedIn ? " Du er logget ind, så dit resultat gemmes også i din Vixx-app." : ""}
        </p>
        <button type="submit" disabled={sending} className={primaryButtonClass}>
          {sending ? "…" : "Vær med"}
        </button>
        {error && (
          <p role="alert" className="text-sm font-semibold text-bad">
            {error}
          </p>
        )}
      </form>,
    );
  }

  if (!state) return shell(<p className="pt-10 text-center text-lg text-muted">Forbinder …</p>);
  if (state.removed) return shell(<p className="pt-10 text-center text-lg">Du er fjernet fra quizzen af læreren.</p>);

  const header = (
    <div className="flex items-center justify-between text-sm text-muted">
      <b className="text-base text-ink">{state.nickname}</b>
      <span>
        {state.score} point{state.status !== "lobby" ? ` · nr. ${state.rank}` : ""}
      </span>
    </div>
  );
  const q = state.question;

  if (state.status === "lobby") {
    return shell(
      <>
        {header}
        <p className="pt-16 text-center text-2xl font-bold">Du er med! 🎉</p>
        <p className="text-center text-muted">Vent på, at læreren starter quizzen.</p>
      </>,
    );
  }

  if (state.status === "finished") {
    return shell(
      <>
        {header}
        <p className="pt-16 text-center text-2xl font-bold">Quizzen er slut</p>
        <p className="text-center text-lg">
          Du fik <b>{state.score}</b> point og blev nr. <b>{state.rank}</b>.
        </p>
      </>,
    );
  }

  return shell(
    <>
      {header}
      {q && (
        <>
          <p className="text-sm text-muted">
            Spørgsmål {state.index + 1} af {state.total}
            {state.status === "question" && ` · ${q.seconds_left} sek.`}
          </p>
          <h1 className="text-xl font-bold">{q.text}</h1>
          {q.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={q.image_url} alt="" className="max-h-[30vh] rounded-xl object-contain" />
          )}
          {state.status === "question" && !state.answered ? (
            <div className="grid flex-1 grid-cols-1 gap-3">
              {q.answers.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={sending}
                  onClick={() => void answer(i)}
                  className={`min-h-16 rounded-2xl px-4 text-left text-lg font-bold text-white ${COLORS[i]} disabled:opacity-60`}
                >
                  {LETTERS[i]}. {a}
                </button>
              ))}
            </div>
          ) : state.status === "question" ? (
            <p className="pt-10 text-center text-xl font-bold">Svar sendt – vent på de andre …</p>
          ) : (
            <div className={`rounded-2xl p-5 text-center text-xl font-bold ${state.my_correct ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`} data-testid="quiz-feedback">
              {state.my_choice == null ? "Du nåede ikke at svare." : state.my_correct ? `Rigtigt! +${state.my_points} point` : "Forkert"}
              {q.correct != null && !state.my_correct && (
                <span className="mt-1 block text-base font-semibold text-ink">
                  Rigtigt svar: {LETTERS[q.correct]}. {q.answers[q.correct]}
                </span>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm font-semibold text-bad">
              {error}
            </p>
          )}
        </>
      )}
    </>,
  );
}
