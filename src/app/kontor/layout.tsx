import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { OfficeSidebar } from "./office-sidebar";

export default async function OfficeLayout({ children }: LayoutProps<"/kontor">) {
  const { user, membership } = await requireRole(["admin", "office"]);

  // Påmindelser i menuen: hvad venter på kontoret.
  const supabase = await createClient();
  const [approvals, holidays] = await Promise.all([
    supabase.from("registrations").select("id", { count: "exact", head: true }).eq("school_id", membership.schoolId).eq("status", "pending"),
    supabase.from("holidays").select("id", { count: "exact", head: true }).eq("school_id", membership.schoolId).eq("status", "pending"),
  ]);
  const badges = { godkendelser: approvals.count ?? 0, ferie: holidays.count ?? 0 };

  return (
    <div className="flex flex-1 flex-col min-[860px]:flex-row">
      <OfficeSidebar
        schoolName={membership.schoolName}
        userName={user.fullName}
        canSwitchSchool={user.memberships.length > 1}
        teaches={membership.teaches}
        badges={badges}
        isPlatformOwner={user.isPlatformOwner}
      />
      <main className="flex w-full max-w-[1240px] min-w-0 flex-col gap-[18px] px-[clamp(16px,4vw,44px)] pt-8 pb-12">
        {children}
      </main>
    </div>
  );
}
