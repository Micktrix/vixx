"use client";

import { useState } from "react";
import { ResultBox, useFormAction } from "@/components/form";
import { inputClass, primaryButtonClass } from "@/components/styles";
import { prepareQuizImage, saveQuestion } from "@/lib/quiz-actions";

const LETTERS = ["A", "B", "C", "D"];
const COLORS = ["bg-[#c0392b]", "bg-[#2471a3]", "bg-[#b7950b]", "bg-[#1e8449]"];

type Initial = { id: string; text: string; answers: string[]; correct: number; timeLimit: number; imagePath: string | null; imageUrl: string | null };

// Ét spørgsmål: tekst, 2–4 svar, det rigtige svar, tid og evt. et billede (fx et færdselstavle).
export function QuizQuestionForm({ quizId, position, initial }: { quizId: string; position: number; initial?: Initial }) {
  const { state, onSubmit, pending } = useFormAction(saveQuestion);
  const [imagePath, setImagePath] = useState(initial?.imagePath ?? "");
  const [preview, setPreview] = useState(initial?.imageUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState("");

  async function pickImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setImageError("");
    const prepared = await prepareQuizImage({ quizId, fileName: file.name, size: file.size, mimeType: file.type });
    if ("error" in prepared) {
      setImageError(prepared.error);
    } else {
      const put = await fetch(prepared.signedUrl, { method: "PUT", body: file, headers: { "content-type": file.type } }).catch(() => null);
      if (put?.ok) {
        setImagePath(prepared.path);
        setPreview(URL.createObjectURL(file));
      } else {
        setImageError("Billedet kunne ikke lægges op. Prøv igen.");
      }
    }
    setUploading(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="question-form">
      <input type="hidden" name="quizId" value={quizId} />
      <input type="hidden" name="position" value={position} />
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="imagePath" value={imagePath} />
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Spørgsmål
        <input name="text" required maxLength={300} defaultValue={initial?.text} placeholder="Fx Hvad betyder dette tavle?" className={inputClass} />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">Svar (sæt prik ved det rigtige)</legend>
        {LETTERS.map((letter, i) => (
          <label key={letter} className="flex items-center gap-2">
            <input type="radio" name="correct" value={i} defaultChecked={(initial?.correct ?? 0) === i} required className="size-[20px] accent-accent" aria-label={`${letter} er rigtigt`} />
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${COLORS[i]}`}>{letter}</span>
            <input
              name="answers"
              defaultValue={initial?.answers[i] ?? ""}
              maxLength={120}
              required={i < 2}
              placeholder={i < 2 ? `Svar ${letter}` : `Svar ${letter} (valgfrit)`}
              aria-label={`Svar ${letter}`}
              className={inputClass}
            />
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-end gap-4">
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
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Billede (valgfrit)
          <input type="file" accept="image/*" onChange={(e) => void pickImage(e.target.files?.[0])} className="text-sm font-normal" />
        </label>
        {preview && (
          <span className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="h-16 rounded-lg object-contain" />
            <button
              type="button"
              onClick={() => {
                setImagePath("");
                setPreview("");
              }}
              className="text-sm font-semibold text-muted underline"
            >
              Fjern billede
            </button>
          </span>
        )}
      </div>
      {uploading && <p className="text-sm text-muted">Lægger billedet op …</p>}
      {imageError && (
        <p role="alert" className="text-sm font-semibold text-bad">
          {imageError}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending || uploading} className={primaryButtonClass}>
          {pending ? "Gemmer …" : initial ? "Gem spørgsmålet" : "Tilføj spørgsmålet"}
        </button>
      </div>
      <ResultBox state={state} />
    </form>
  );
}
