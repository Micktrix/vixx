import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { PlayerScreen } from "./player-screen";

// Deltagerens side: kaldenavn og derefter spørgsmålene. Kræver intet login.
export default async function QuizPlayerPage({ params }: PageProps<"/q/[code]">) {
  const { code } = await params;
  if (!/^\d{6}$/.test(code)) notFound();
  const user = await getCurrentUser();
  return <PlayerScreen code={code} loggedIn={!!user} />;
}
