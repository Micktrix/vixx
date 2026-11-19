import { QuizEditor } from "@/components/quiz-pages";
import { Screen } from "../../screen";

export default async function TeacherQuizEditPage({ params }: PageProps<"/laerer/quiz/[id]">) {
  const { id } = await params;
  return (
    <Screen
      title="Quiz"
      sub="Ret quiz"
      back={{ href: "/laerer/quiz", label: "Alle quizzer" }}
    >
      <QuizEditor base="/laerer/quiz" id={id} showBack={false} />
    </Screen>
  );
}
