import { OfficePlaceholder } from "./placeholder";
import { sectionBySlug } from "./sections";

export default function OfficeCalendarPage() {
  return <OfficePlaceholder section={sectionBySlug(null)} />;
}
