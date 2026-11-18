import { QuizList } from "@/components/quiz-pages";

// Kontor → Quiz: quizzer til teoriholdene, som køres live på storskærmen.
export default function OfficeQuizPage() {
  return (
    <>
      <header>
        <p className="text-sm text-muted">Kontor</p>
        <h1 className="text-[30px] font-bold">Quiz</h1>
      </header>
      <div className="max-w-[860px]">
        <QuizList base="/kontor/quiz" />
      </div>
    </>
  );
}
