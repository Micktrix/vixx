import { OfficeSidebar } from "./office-sidebar";

export default function OfficeLayout({ children }: LayoutProps<"/kontor">) {
  return (
    <div className="flex flex-1 flex-col min-[860px]:flex-row">
      <OfficeSidebar />
      <main className="flex w-full max-w-[1240px] min-w-0 flex-col gap-[18px] px-[clamp(16px,4vw,44px)] pt-8 pb-12">
        {children}
      </main>
    </div>
  );
}
