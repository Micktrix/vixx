import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, TextField } from "@/components/form";
import { QuizQuestionForm } from "@/components/quiz-question-form";
import { requireRole } from "@/lib/auth/session";
import { createQuiz, deleteQuestion, deleteQuiz, startQuiz, updateQuiz } from "@/lib/quiz-actions";
import { imageUrl, loadQuiz, loadQuizzes, type QuizSummary } from "@/lib/quiz-data";

const box = "flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]";
const LETTERS = ["A", "B", "C", "D"];

// Quiz-oversigten for lærere og kontor: egne quizzer og skolens delte (flueben "Del med de andre lærere").
export async function QuizList({ base }: { base: string }) {
  const { user, membership } = await requireRole(["admin", "office", "instructor"]);
  const quizzes = await loadQuizzes(membership.schoolId);
  const mine = quizzes.filter((q) => q.ownerId === user.id);
  const shared = quizzes.filter((q) => q.ownerId !== user.id);

  const row = (q: QuizSummary) => (
    <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-b-0" data-testid="quiz-row">
      <Link href={`${base}/${q.id}`} className="min-w-0">
        <b className="text-[15px] hover:text-accent-ink hover:underline">{q.title}</b>
        <span className="block text-[13px] text-muted">
          {q.questions} spørgsmål · {q.ownerName}
          {q.shared ? " · delt med skolen" : " · kun mig"}
        </span>
      </Link>
      {q.questions > 0 && (
        <ActionForm action={startQuiz} submitLabel="Start på storskærm" pendingLabel="…">
          <input type="hidden" name="id" value={q.id} />
        </ActionForm>
      )}
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <section className={box}>
        <h2 className="text-lg font-bold">Ny quiz</h2>
        <ActionForm action={createQuiz} submitLabel="Opret quiz" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="base" value={base} />
          <TextField label="Titel" name="title" required maxLength={120} placeholder="Fx Vigepligt og kryds" className="min-w-[220px] flex-1" />
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="shared" className="size-5 accent-accent" />
            Del med de andre lærere
          </label>
        </ActionForm>
      </section>
      <section className={box}>
        <h2 className="text-lg font-bold">Mine quizzer</h2>
        {!mine.length && <p className="text-sm text-muted">Du har ingen quizzer endnu.</p>}
        <ul className="flex flex-col">{mine.map(row)}</ul>
      </section>
      <section className={box}>
        <h2 className="text-lg font-bold">Skolens delte quizzer</h2>
        {!shared.length && <p className="text-sm text-muted">Ingen delte quizzer endnu. Sæt flueben ved »Del med de andre lærere« på en quiz.</p>}
        <ul className="flex flex-col">{shared.map(row)}</ul>
      </section>
    </div>
  );
}

// Ret en quiz: titel, deling, spørgsmål, start og slet.
export async function QuizEditor({ base, id, showBack = true }: { base: string; id: string; showBack?: boolean }) {
  const { user, membership } = await requireRole(["admin", "office", "instructor"]);
  const quiz = await loadQuiz(id);
  if (!quiz) notFound();
  const isStaff = membership.role === "admin" || membership.role === "office";
  const canEdit = quiz.ownerId === user.id || (isStaff && quiz.shared);
  const images = await Promise.all(quiz.questions.map((q) => imageUrl(q.imagePath)));

  return (
    <div className="flex flex-col gap-4">
      {showBack && (
        <Link href={base} className="text-sm font-semibold text-muted hover:text-ink">
          ‹ Alle quizzer
        </Link>
      )}
      <section className={box}>
        {canEdit ? (
          <ActionForm action={updateQuiz} submitLabel="Gem" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={quiz.id} />
            <TextField label="Titel" name="title" required maxLength={120} defaultValue={quiz.title} className="min-w-[220px] flex-1" />
            {quiz.ownerId === user.id ? (
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name="shared" defaultChecked={quiz.shared} className="size-5 accent-accent" />
                Del med de andre lærere
              </label>
            ) : (
              <input type="hidden" name="shared" value="on" />
            )}
          </ActionForm>
        ) : (
          <h2 className="text-xl font-bold">{quiz.title}</h2>
        )}
        <p className="text-[13px] text-muted">Lavet af {quiz.ownerName}.</p>
        {quiz.questions.length > 0 && (
          <ActionForm action={startQuiz} submitLabel="Start på storskærm" pendingLabel="Starter …">
            <input type="hidden" name="id" value={quiz.id} />
          </ActionForm>
        )}
      </section>

      <ol className="flex flex-col gap-3" data-testid="quiz-questions">
        {quiz.questions.map((q, i) => (
          <li key={q.id} className={box}>
            <div className="flex items-start justify-between gap-2">
              <b>
                {i + 1}. {q.text}
              </b>
              <span className="text-sm text-muted">{q.timeLimit} sek.</span>
            </div>
            <p className="text-sm text-muted">
              Rigtigt: {LETTERS[q.correct]}. {q.answers[q.correct]}
            </p>
            {canEdit && (
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-muted hover:text-ink">Ret eller slet</summary>
                <div className="mt-3 flex flex-col gap-3">
                  <QuizQuestionForm
                    quizId={quiz.id}
                    position={q.position}
                    initial={{ id: q.id, text: q.text, answers: q.answers, correct: q.correct, timeLimit: q.timeLimit, imagePath: q.imagePath, imageUrl: images[i] }}
                  />
                  <ActionForm action={deleteQuestion} submitLabel="Slet spørgsmålet" pendingLabel="…" primary={false} confirmText="Slet spørgsmålet?">
                    <input type="hidden" name="id" value={q.id} />
                  </ActionForm>
                </div>
              </details>
            )}
          </li>
        ))}
      </ol>

      {canEdit && (
        <section className={box}>
          <h2 className="text-lg font-bold">Nyt spørgsmål</h2>
          <QuizQuestionForm key={quiz.questions.length} quizId={quiz.id} position={(quiz.questions.at(-1)?.position ?? 0) + 1} />
        </section>
      )}

      {canEdit && (
        <ActionForm action={deleteQuiz} submitLabel="Slet quizzen" pendingLabel="…" primary={false} confirmText={`Slet quizzen "${quiz.title}"?`}>
          <input type="hidden" name="id" value={quiz.id} />
          <input type="hidden" name="base" value={base} />
        </ActionForm>
      )}
    </div>
  );
}
