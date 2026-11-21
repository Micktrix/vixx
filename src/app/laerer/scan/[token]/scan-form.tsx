"use client";

import { useState } from "react";
import { ResultBox, useFormAction } from "@/components/form";
import { inputClass } from "@/components/styles";
import { formatDate } from "@/lib/dates";
import { completionText, isDarkTopic, lessonsWord, progressText, type ModuleProgress } from "@/lib/module-progress";
import { recordScan } from "./actions";

const box = "flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4";
const check = "size-[20px] shrink-0 accent-accent";
const primary =
  "flex h-12 w-full items-center justify-center rounded-[14px] border border-accent bg-accent text-[15px] font-bold text-ink disabled:opacity-60";

// Scanning af eleven (ombygning 21. nov. 2026): modulerne én gang med fremskridt, antal lektioner (1 = 45 min.),
// modulets køreemner med flueben fra start, og afslutning af modulet i samme tryk, når minimum nås.
export function ScanForm({
  token,
  studentId,
  modules,
  suggestedId,
  theoryAtScan,
  manualGearModules,
  lastModuleId,
  daysWarning,
  today,
}: {
  token: string;
  studentId: string;
  modules: ModuleProgress[];
  suggestedId: string;
  theoryAtScan: boolean;
  manualGearModules: string[];
  lastModuleId: string;
  daysWarning: string | null; // vises ved afslutning af sidste modul
  today: string;
}) {
  const { state, onSubmit, pending } = useFormAction(recordScan);
  const [moduleId, setModuleId] = useState(suggestedId);
  const [kind, setKind] = useState<"driving" | "theory">("driving");
  const [count, setCount] = useState(2);
  const [darkChecked, setDarkChecked] = useState(false);
  const [darkConfirm, setDarkConfirm] = useState(false);
  const [transferred, setTransferred] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [ktaChecked, setKtaChecked] = useState(false);
  const [ktaConfirm, setKtaConfirm] = useState(false);
  const m = modules.find((x) => x.id === moduleId)!;
  const darkRequired = m.min_dark > 0;
  const darkTopic = m.drivingTopics.find(isDarkTopic) ?? "";
  const darkNow = kind === "driving" && darkChecked && (!darkRequired || darkConfirm);
  // KTA (afsnit 9) bekræftes som mørke: intet flueben fra start, og "Ja, kørt på køreteknisk anlæg".
  const ktaNow = kind === "driving" && !!m.ktaTopic && ktaChecked && ktaConfirm;

  const reachesWith = (n: number) =>
    m.driving + (kind === "driving" ? n : 0) >= m.min_driving &&
    (!darkRequired || m.darkDone || darkNow) &&
    (!m.ktaTopic || m.ktaDone || ktaNow) &&
    (!theoryAtScan || m.theory + (kind === "theory" ? n : 0) >= m.min_theory);
  const reaches = reachesWith(count);
  // Afsluttes modulet, og er der valgt flere lektioner, end modulet mangler, tælles resten i næste modul
  // (Michael 21. nov. 2026: 4 af 5 kørt + 2 lektioner = 1 i modul 1 og 1 i modul 2).
  const next = modules[modules.findIndex((x) => x.id === m.id) + 1];
  // Mindst den lektion, hvor mørke (7.19) er bekræftet, bliver i dette modul.
  const needed = Math.max(kind === "driving" ? m.min_driving - m.driving : m.min_theory - m.theory, (darkNow && !m.darkDone) || (ktaNow && !m.ktaDone) ? 1 : 0);
  const split = !!next && !next.completed && !transferred && count > needed && reachesWith(needed);
  const nextDarkTopic = next && next.min_dark > 0 ? next.drivingTopics.find(isDarkTopic) : undefined;
  // Modulerne afsluttes i rækkefølge: kun det aktuelle modul kan afsluttes.
  const canComplete = m.id === suggestedId && (reaches || transferred);
  const word = lessonsWord(count, kind);

  const choose = (id: string) => {
    setModuleId(id);
    setDarkChecked(false);
    setDarkConfirm(false);
    setTransferred(false);
    setDeclared(false);
    setKtaChecked(false);
    setKtaConfirm(false);
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5" data-testid="scan-form">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="moduleNumber" value={m.number} />
      <input type="hidden" name="darkTopic" value={darkTopic} />
      <input type="hidden" name="darkRequired" value={darkRequired ? "1" : "0"} />
      <input type="hidden" name="ktaTopic" value={m.ktaTopic ?? ""} />

      <fieldset className={box} data-testid="scan-modules">
        <legend className="sr-only">Modul</legend>
        {modules.map((x) =>
          x.completed ? (
            <div key={x.id} className="px-3 py-1 text-[15px]">
              <b>Modul {x.number}</b> <span className="text-ok">✓</span>
              <span className="block text-[13px] text-ok">{completionText(x.completed, formatDate)}</span>
            </div>
          ) : (
            <label
              key={x.id}
              className={`flex items-center gap-3 rounded-[14px] border px-3 py-2.5 ${x.id === moduleId ? "border-accent bg-accent-bg" : "border-line"}`}
            >
              <input type="radio" name="moduleId" value={x.id} checked={x.id === moduleId} onChange={() => choose(x.id)} className={check} />
              <span>
                <b>Modul {x.number}</b>
                {x.id === suggestedId && <span className="text-[13px] font-semibold text-accent-ink"> · aktuelt</span>}
                <span className="block text-[13px] text-muted">
                  {progressText(x, theoryAtScan)}
                  {x.startedOn && ` · startet ${formatDate(x.startedOn)}`}
                </span>
              </span>
            </label>
          ),
        )}
      </fieldset>

      <section className={box}>
        {theoryAtScan ? (
          <div className="grid grid-cols-2 gap-2">
            {(["driving", "theory"] as const).map((k) => (
              <label
                key={k}
                className={`flex items-center gap-2.5 rounded-[14px] border px-3 py-2.5 font-semibold ${k === kind ? "border-accent bg-accent-bg" : "border-line"}`}
              >
                <input type="radio" name="kind" value={k} checked={k === kind} onChange={() => setKind(k)} className={check} />
                {k === "theory" ? "Teori" : "Kørsel"}
              </label>
            ))}
          </div>
        ) : (
          <input type="hidden" name="kind" value="driving" />
        )}
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Antal lektioner <span className="font-normal text-muted">(1 lektion = 45 min.)</span>
          <select name="count" value={count} onChange={(e) => setCount(Number(e.target.value))} className={inputClass}>
            {transferred && <option value={0}>Ingen nye lektioner</option>}
            {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        {kind === "driving" && m.drivingTopics.length > 0 && (
          <fieldset className="flex flex-col gap-1 rounded-[14px] border border-line px-3 py-2.5" data-testid="scan-topics" key={moduleId}>
            <legend className="px-1 text-[13px] font-semibold">Køreemner – fjern fluebenet ved det, der ikke blev kørt:</legend>
            {m.drivingTopics.map((item) => {
              const isDark = isDarkTopic(item) && darkRequired;
              const done = m.drivenTopics.includes(item);
              const missing = m.notDriven.includes(item);
              return (
                <div key={item} className="flex flex-col">
                  <label
                    data-state={done ? "driven" : missing ? "missing" : "new"}
                    className={`flex items-start gap-2.5 rounded-lg px-1.5 py-0.5 text-[14px] ${done ? "bg-ok-bg" : ""}`}
                  >
                    <input type="hidden" name="allTopic" value={item} />
                    {item === m.ktaTopic ? (
                      <input
                        type="checkbox"
                        name="driveTopic"
                        value={item}
                        checked={ktaChecked}
                        onChange={(e) => {
                          setKtaChecked(e.target.checked);
                          setKtaConfirm(false);
                        }}
                        className={`${check} mt-0.5`}
                      />
                    ) : isDark ? (
                      <input
                        type="checkbox"
                        name="driveTopic"
                        value={item}
                        checked={darkChecked}
                        onChange={(e) => {
                          setDarkChecked(e.target.checked);
                          setDarkConfirm(false);
                        }}
                        className={`${check} mt-0.5`}
                      />
                    ) : (
                      <input type="checkbox" name="driveTopic" value={item} defaultChecked className={`${check} mt-0.5`} />
                    )}
                    <span>
                      {item}
                      {done && <span className="ml-1.5 text-[12px] font-semibold text-ok">kørt</span>}
                      {missing && <span className="ml-1.5 rounded-full bg-bad-bg px-2 text-[12px] font-semibold text-bad">mangler</span>}
                      {item === m.ktaTopic && !ktaChecked && !done && (
                        <span className="block text-[12px] text-muted">Sæt kun flueben, hvis eleven har kørt på køreteknisk anlæg i denne lektion.</span>
                      )}
                      {isDark && !darkChecked && (
                        <span className="block text-[12px] text-muted">Sæt kun flueben, hvis der er kørt i mørke i denne lektion.</span>
                      )}
                    </span>
                  </label>
                  {item === m.ktaTopic && ktaChecked && (
                    <label className="ml-8 mt-1 flex items-start gap-2.5 rounded-lg border border-accent-line bg-accent-bg px-2 py-1.5 text-[14px] font-semibold">
                      <input
                        type="checkbox"
                        name="ktaConfirm"
                        checked={ktaConfirm}
                        onChange={(e) => setKtaConfirm(e.target.checked)}
                        className={`${check} mt-0.5`}
                      />
                      Ja, kørt på køreteknisk anlæg
                    </label>
                  )}
                  {isDark && darkChecked && (
                    <label className="ml-8 mt-1 flex items-start gap-2.5 rounded-lg border border-accent-line bg-accent-bg px-2 py-1.5 text-[14px] font-semibold">
                      <input
                        type="checkbox"
                        name="darkConfirm"
                        checked={darkConfirm}
                        onChange={(e) => setDarkConfirm(e.target.checked)}
                        className={`${check} mt-0.5`}
                      />
                      <span>
                        Ja, kørt i mørke
                        <span className="block text-[12px] font-normal text-muted">Din underskrift sættes på mørkekørslen.</span>
                      </span>
                    </label>
                  )}
                </div>
              );
            })}
          </fieldset>
        )}

        {kind === "driving" && manualGearModules.includes(moduleId) && (
          <label className="flex items-center gap-2.5 text-[15px]">
            <input type="checkbox" name="manualGear" className={check} />
            Manuelt gear (kode 78)
          </label>
        )}
      </section>

      {canComplete ? (
        <section className="flex flex-col gap-3 rounded-[20px] border border-ok/30 bg-ok-bg p-4" data-testid="complete-module" key={moduleId}>
          {split && <input type="hidden" name="splitHere" value={needed} />}
          <b className="text-[17px]">
            {transferred && !reaches
              ? `Afslut modul ${m.number} (overført fra lektionsplan)`
              : `Det her er sidste lektion i modul ${m.number}. Afslut modulet nu.`}
          </b>
          {split && (
            <div className="flex flex-col gap-2 rounded-[14px] border border-accent-line bg-surface px-3 py-2.5" data-testid="scan-split">
              <p className="text-[15px] font-semibold">
                {needed > 0 ? `${lessonsWord(needed, kind)} afslutter modul ${m.number}, og ` : `Modul ${m.number} har nået minimum, og `}
                {lessonsWord(count - needed, kind)} tælles i modul {next.number}.
              </p>
              {kind === "driving" && next.drivingTopics.length > 0 && (
                <fieldset className="flex flex-col gap-1" key={next.id}>
                  <legend className="text-[13px] font-semibold">Køreemner i modul {next.number} – fjern fluebenet ved det, der ikke blev kørt:</legend>
                  {next.drivingTopics.map((item) =>
                    item === nextDarkTopic ? (
                      <input key={item} type="hidden" name="nextAllTopic" value={item} />
                    ) : (
                      <label key={item} className="flex items-start gap-2.5 px-1.5 py-0.5 text-[14px]">
                        <input type="hidden" name="nextAllTopic" value={item} />
                        <input type="checkbox" name="nextDriveTopic" value={item} defaultChecked className={`${check} mt-0.5`} />
                        {item}
                      </label>
                    ),
                  )}
                  {nextDarkTopic && <span className="text-[12px] text-muted">Mørke (7.19) i modul {next.number} bekræftes ved en senere scanning.</span>}
                </fieldset>
              )}
            </div>
          )}
          {m.notDriven.length > 0 && (
            <p className="text-sm text-bad" data-testid="complete-not-driven">
              Ikke kørt endnu: {m.notDriven.join(" · ")}. Du kan afslutte alligevel.
            </p>
          )}
          {m.id === lastModuleId && daysWarning && (
            <p className="text-sm text-bad" data-testid="days-warning">
              {daysWarning}
            </p>
          )}
          {!theoryAtScan && (
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Teorilektioner i modulet
              <input
                name="theoryLessons"
                type="number"
                min={transferred ? 0 : m.min_theory}
                max={100}
                defaultValue={m.min_theory}
                required
                className={inputClass}
              />
              <span className="font-normal text-muted">Minimum er {m.min_theory}. Skriv flere, hvis eleven har haft ekstra teori.</span>
            </label>
          )}
          {m.number !== modules[0].number && (
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Modulet startede
              <input name="startedOn" type="date" max={today} defaultValue={m.startedOn ?? today} className={inputClass} />
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Selvstudie <span className="font-normal text-muted">(valgfrit: antal lektioner og afsnit)</span>
            <input name="selfStudy" maxLength={500} className={inputClass} />
          </label>
          <label className="flex items-start gap-2.5 text-[15px]">
            <input
              type="checkbox"
              name="declaration"
              checked={declared}
              onChange={(e) => setDeclared(e.target.checked)}
              className={`${check} mt-0.5`}
            />
            Jeg erklærer, at eleven har opnået de nødvendige kompetencer og opfylder målene i undervisningsplanen for modulet.
          </label>
          <button type="submit" name="complete" value="1" disabled={pending || !declared} className={primary}>
            {pending ? "Gemmer …" : count > 0 ? `Bekræft og afslut modul ${m.number}` : `Afslut modul ${m.number}`}
          </button>
          {!declared && <p className="text-[13px] font-semibold text-accent-ink">Sæt flueben ved erklæringen for at afslutte modulet.</p>}
          <ResultBox state={state} />
          <p className="text-[13px] text-muted">Dato, dit navn og din underskrift kommer på modulplanen. Afslutningen kan ikke fortrydes.</p>
          {count > 0 && (
            <button type="submit" name="complete" value="0" disabled={pending} className="self-start text-sm font-semibold text-muted underline">
              Bekræft kun {word} uden at afslutte
            </button>
          )}
        </section>
      ) : (
        <button type="submit" name="complete" value="0" disabled={pending} className={primary}>
          {pending ? "Gemmer …" : `Bekræft ${word}`}
        </button>
      )}
      {!canComplete && <ResultBox state={state} />}

      {m.id === suggestedId && (
        <details className="px-1 text-sm" data-testid="complete-module-transferred" open={transferred}>
          <summary className="cursor-pointer text-muted">Er eleven overført fra lektionsplanen?</summary>
          <label className="mt-2 flex items-center gap-2.5 text-[15px]">
            <input
              type="checkbox"
              name="transferred"
              checked={transferred}
              onChange={(e) => {
                setTransferred(e.target.checked);
                if (!e.target.checked && count === 0) setCount(2);
              }}
              className={check}
            />
            Overført fra lektionsplan (modul {m.number} kan afsluttes uden minimum)
          </label>
        </details>
      )}
      <p className="rounded-[16px] bg-soft px-4 py-3 text-sm">Tælles i elevens modulplan. Timen til lønnen registrerer du som altid i kalenderen.</p>
    </form>
  );
}
