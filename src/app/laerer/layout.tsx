import { PartSwitch } from "@/components/part-switch";
import { isStaff, requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "./bottom-nav";

// Mobil-først. På en stor skærm vises appen som en telefon midt på siden, som i prototypen.
export default async function InstructorLayout({ children }: LayoutProps<"/laerer">) {
  const { user, membership } = await requireRole(["instructor"]);

  // Antal ulæste beskeder til bundmenuen.
  const supabase = await createClient();
  const [{ data: messages }, { data: reads }] = await Promise.all([
    supabase.from("messages").select("id").eq("school_id", membership.schoolId).limit(200),
    supabase.from("message_reads").select("message_id").eq("user_id", user.id),
  ]);
  const read = new Set((reads ?? []).map((r) => r.message_id));
  const unread = (messages ?? []).filter((m) => !read.has(m.id)).length;

  return (
    <div className="flex h-dvh justify-center sm:p-5">
      <div
        data-switch={isStaff(membership) ? "" : undefined}
        className="group/frame flex w-full flex-col overflow-hidden bg-bg sm:max-h-[844px] sm:max-w-[400px] sm:rounded-[36px] sm:border sm:border-line sm:shadow-[0_20px_50px_-30px_rgba(38,36,34,0.35)]"
      >
        {isStaff(membership) && (
          <div className="px-5 pt-[calc(12px+env(safe-area-inset-top))]">
            <PartSwitch current="laerer" />
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        <BottomNav unread={unread} />
      </div>
    </div>
  );
}
