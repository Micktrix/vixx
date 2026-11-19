import { QuizList } from "@/components/quiz-pages";
import { Screen } from "../screen";

// Lærer-appen → Quiz.
export default function TeacherQuizPage() {
  return (
    <Screen
      title="Quiz"
      sub="Til teoriholdene"
      back={{ href: "/laerer", label: "Kalender" }}
    >
      <QuizList base="/laerer/quiz" />
    </Screen>
  );
}
