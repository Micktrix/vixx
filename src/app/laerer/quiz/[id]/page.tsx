import Link from "next/link";
import { QuizEditor } from "@/components/quiz-pages";
import { Screen } from "../../screen";

export default async function TeacherQuizEditPage({ params }: PageProps<"/laerer/quiz/[id]">) {
  const { id } = await params;
  return (
    <Screen
      title="Quiz"
      sub="Ret quiz"
      action={
        <Link href="/laerer/quiz" className="text-sm font-semibold text-muted">
          Luk
        </Link>
      }
    >
      <QuizEditor base="/laerer/quiz" id={id} />
    </Screen>
  );
}
