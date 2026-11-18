import { MaterialsView } from "@/components/materials-view";

// Kontor → Materialer: skolens vidensbank.
export default async function OfficeMaterialsPage({ searchParams }: PageProps<"/kontor/materialer">) {
  return (
    <>
      <header>
        <p className="text-sm text-muted">Kontor</p>
        <h1 className="text-[30px] font-bold">Materialer</h1>
      </header>
      <div className="max-w-[860px]">
        <MaterialsView base="/kontor/materialer" params={await searchParams} />
      </div>
    </>
  );
}
