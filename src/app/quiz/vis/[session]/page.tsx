import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireRole } from "@/lib/auth/session";
import { siteOrigin } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { HostScreen } from "./host-screen";

// Quizzen på storskærmen i teorilokalet. Kun værten (læreren, der startede runden) kan åbne den.
export default async function QuizHostPage({ params }: PageProps<"/quiz/vis/[session]">) {
  const { session: id } = await params;
  await requireRole(["admin", "office", "instructor"]);
  const supabase = await createClient();
  const { data: session } = await supabase.from("quiz_sessions").select("id, code").eq("id", id).maybeSingle();
  if (!session) notFound();
  const joinUrl = `${await siteOrigin()}/q/${session.code}`;
  const qr = await QRCode.toString(joinUrl, { type: "svg", margin: 1 });
  return <HostScreen sessionId={session.id} code={session.code} joinUrl={joinUrl} qrSvg={qr} />;
}
