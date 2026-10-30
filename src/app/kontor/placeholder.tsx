import type { OfficeSection } from "./sections";

export function OfficePlaceholder({ section }: { section: OfficeSection }) {
  return (
    <>
      <header>
        <p className="text-sm text-muted">Kontor</p>
        <h1 className="text-[30px] font-bold">{section.label}</h1>
      </header>
      <section className="rounded-[20px] border border-line bg-surface p-[18px]">
        <p className="text-muted">Denne side bygges i {section.comingIn}.</p>
      </section>
    </>
  );
}
