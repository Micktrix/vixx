import { QuizEditor } from "@/components/quiz-pages";

export default async function OfficeQuizEditPage({ params }: PageProps<"/kontor/quiz/[id]">) {
  const { id } = await params;
  return (
    <div className="max-w-[860px]">
      <QuizEditor base="/kontor/quiz" id={id} />
    </div>
  );
}
