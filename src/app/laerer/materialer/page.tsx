import { MaterialsView } from "@/components/materials-view";
import { Screen } from "../screen";

// Lærer-appen → Materialer: skolens vidensbank og egne materialer.
export default async function TeacherMaterialsPage({ searchParams }: PageProps<"/laerer/materialer">) {
  return (
    <Screen
      title="Materialer"
      sub="Vidensbank"
      back={{ href: "/laerer", label: "Kalender" }}
    >
      <MaterialsView base="/laerer/materialer" params={await searchParams} />
    </Screen>
  );
}
