import { ResourceCalendar } from "../resources/resource-calendar";

export default async function RoomsPage({ searchParams }: PageProps<"/kontor/lokaler">) {
  return <ResourceCalendar kind="room" searchParams={await searchParams} />;
}
