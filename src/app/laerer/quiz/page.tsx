import Link from "next/link";
import { QuizList } from "@/components/quiz-pages";
import { Screen } from "../screen";

// Lærer-appen → Quiz.
export default function TeacherQuizPage() {
  return (
    <Screen
      title="Quiz"
      sub="Til teoriholdene"
      action={
        <Link href="/laerer" className="text-sm font-semibold text-muted">
          Luk
        </Link>
      }
    >
      <QuizList base="/laerer/quiz" />
    </Screen>
  );
}
