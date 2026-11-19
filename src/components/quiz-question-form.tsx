"use client";

import { useState } from "react";
import { FileButton } from "@/components/file-button";
import { ResultBox, useFormAction } from "@/components/form";
import { inputClass, primaryButtonClass } from "@/components/styles";
import { prepareQuizImage, saveQuestion } from "@/lib/quiz-actions";

const LETTERS = ["A", "B", "C", "D"];
const COLORS = ["bg-[#c0392b]", "bg-[#2471a3]", "bg-[#b7950b]", "bg-[#1e8449]"];

type Initial = {
  id: string;
  text: string;
  answers: string[];
  answerImages: { path: string; url: string | null }[];
  correct: number;
  timeLimit: number;
  imagePath: string | null;
  imageUrl: string | null;
};

type Picked = { path: string; url: string };

// Et billede til spørgsmålet eller til et svar: lægges op med det samme og gemmes med spørgsmålet.
function useQuizImage(quizId: string, initial: Picked | null) {
  const [image, setImage] = useState<Picked | null>(initial);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function pick(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError("");
    const prepared = await prepareQuizImage({ quizId, fileName: file.name, size: file.size, mimeType: file.type });
    if ("error" in prepared) {
      setError(prepared.error);
    } else {
      const put = await fetch(prepared.signedUrl, { method: "PUT", body: file, headers: { "content-type": file.type } }).catch(() => null);
      if (put?.ok) setImage({ path: prepared.path, url: URL.createObjectURL(file) });
      else setError("Billedet kunne ikke lægges op. Prøv igen.");
    }
    setUploading(false);
  }

  return { image, uploading, error, pick, clear: () => setImage(null) };
}

function ImagePicker({ img, label, small = false }: { img: ReturnType<typeof useQuizImage>; label: string; small?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      {img.image ? (
        <span className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.image.url} alt="" className={`${small ? "h-12" : "h-16"} rounded-lg border border-line object-contain`} />
          <button type="button" onClick={img.clear} className="text-sm font-semibold text-muted underline">
            Fjern billede
          </button>
        </span>
      ) : (
        <FileButton label={label} accept="image/*" disabled={img.uploading} onFile={(f) => void img.pick(f)} />
      )}
      {img.uploading && <p className="text-sm text-muted">Lægger billedet op …</p>}
      {img.error && (
        <p role="alert" className="text-sm font-semibold text-bad">
          {img.error}
        </p>
      )}
    </div>
  );
}

function AnswerRow({ index, quizId, initial }: { index: number; quizId: string; initial?: Initial }) {
  const letter = LETTERS[index];
  const start = initial?.answerImages[index];
  const img = useQuizImage(quizId, start?.path && start.url ? { path: start.path, url: start.url } : null);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line p-2.5" data-testid={`answer-${letter}`}>
      <label className="flex items-center gap-2">
        <input type="radio" name="correct" value={index} defaultChecked={(initial?.correct ?? 0) === index} required className="size-[20px] accent-accent" aria-label={`${letter} er rigtigt`} />
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${COLORS[index]}`}>{letter}</span>
        <input
          name="answers"
          defaultValue={initial?.answers[index] ?? ""}
          maxLength={120}
          placeholder={index < 2 ? `Svar ${letter} (tekst og/eller billede)` : `Svar ${letter} (valgfrit)`}
          aria-label={`Svar ${letter}`}
          className={inputClass}
        />
      </label>
      <input type="hidden" name="answerImages" value={img.image?.path ?? ""} />
      <div className="pl-[68px]">
        <ImagePicker img={img} label={`Billede til svar ${letter}`} small />
      </div>
    </div>
  );
}

// Ét spørgsmål: tekst, evt. billede, 2–4 svar (tekst og/eller billede), det rigtige svar og tid.
export function QuizQuestionForm({ quizId, position, initial }: { quizId: string; position: number; initial?: Initial }) {
  const { state, onSubmit, pending } = useFormAction(saveQuestion);
  const questionImage = useQuizImage(quizId, initial?.imagePath && initial.imageUrl ? { path: initial.imagePath, url: initial.imageUrl } : null);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="question-form">
      <input type="hidden" name="quizId" value={quizId} />
      <input type="hidden" name="position" value={position} />
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="imagePath" value={questionImage.image?.path ?? ""} />
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Spørgsmål
        <input name="text" required maxLength={300} defaultValue={initial?.text} placeholder="Fx Hvad betyder tavlen?" className={inputClass} />
      </label>
      <div className="flex flex-col gap-1.5 text-sm font-bold">
        Billede til spørgsmålet (valgfrit)
        <ImagePicker img={questionImage} label="Vælg billede" />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">Svar (sæt prik ved det rigtige)</legend>
        <p className="text-[13px] text-muted">Et svar kan være tekst, et billede eller begge dele – fx fire tavler at vælge imellem.</p>
        {LETTERS.map((letter, i) => (
          <AnswerRow key={letter} index={i} quizId={quizId} initial={initial} />
        ))}
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Tid
        <select name="timeLimit" defaultValue={initial?.timeLimit ?? 20} className={`${inputClass} w-[120px]`}>
          {[10, 20, 30, 45, 60].map((s) => (
            <option key={s} value={s}>
              {s} sek.
            </option>
          ))}
        </select>
      </label>
      <div>
        <button type="submit" disabled={pending || questionImage.uploading} className={primaryButtonClass}>
          {pending ? "Gemmer …" : initial ? "Gem spørgsmålet" : "Tilføj spørgsmålet"}
        </button>
      </div>
      <ResultBox state={state} />
    </form>
  );
}
