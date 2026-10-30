import { BottomNav } from "./bottom-nav";

// Mobil-først. På en stor skærm vises appen som en telefon midt på siden, som i prototypen.
export default function InstructorLayout({ children }: LayoutProps<"/laerer">) {
  return (
    <div className="flex h-dvh justify-center sm:p-5">
      <div className="flex w-full flex-col overflow-hidden bg-bg sm:max-h-[844px] sm:max-w-[400px] sm:rounded-[36px] sm:border sm:border-line sm:shadow-[0_20px_50px_-30px_rgba(38,36,34,0.35)]">
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        <BottomNav />
      </div>
    </div>
  );
}
