import { ResourceCalendar } from "../resources/resource-calendar";

export default async function VehiclesPage({ searchParams }: PageProps<"/kontor/koeretoejer">) {
  return <ResourceCalendar kind="vehicle" searchParams={await searchParams} />;
}
