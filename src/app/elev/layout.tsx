import { requireRole } from "@/lib/auth/session";
import { StudentNav } from "./student-nav";

// Elevens app. Mobil-først; på en stor skærm vises den som en telefon midt på siden, som lærer-appen.
export default async function StudentLayout({ children }: LayoutProps<"/elev">) {
  const { membership } = await requireRole(["student"]);
  return (
    <div className="flex h-dvh justify-center sm:p-5">
      <div className="flex w-full flex-col overflow-hidden bg-bg sm:max-h-[844px] sm:max-w-[400px] sm:rounded-[36px] sm:border sm:border-line sm:shadow-[0_20px_50px_-30px_rgba(38,36,34,0.35)]">
        {membership.schoolLogo && (
          <div className="flex items-center gap-2 px-5 pt-[calc(10px+env(safe-area-inset-top))]" data-testid="school-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={membership.schoolLogo} alt={membership.schoolName} className="h-7 max-w-[140px] object-contain" />
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        <StudentNav />
      </div>
    </div>
  );
}
