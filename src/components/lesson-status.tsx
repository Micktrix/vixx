import type { ModuleProgress } from "@/lib/module-progress";

// Køreemner i et modul, der ikke er kørt endnu (vises, når der er kørt i modulet).
export function LessonStatus({ module: m }: { module: ModuleProgress }) {
  if (!m.notDriven.length) return null;
  return (
    <p className="text-[13px] text-bad" data-testid="not-driven">
      Mangler: {m.notDriven.join(" · ")}
    </p>
  );
}
