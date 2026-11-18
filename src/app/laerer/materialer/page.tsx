import Link from "next/link";
import { MaterialsView } from "@/components/materials-view";
import { Screen } from "../screen";

// Lærer-appen → Materialer: skolens vidensbank og egne materialer.
export default async function TeacherMaterialsPage({ searchParams }: PageProps<"/laerer/materialer">) {
  return (
    <Screen
      title="Materialer"
      sub="Vidensbank"
      action={
        <Link href="/laerer" className="text-sm font-semibold text-muted">
          Luk
        </Link>
      }
    >
      <MaterialsView base="/laerer/materialer" params={await searchParams} />
    </Screen>
  );
}
