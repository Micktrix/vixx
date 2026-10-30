import { OfficePlaceholder } from "../placeholder";
import { sectionBySlug } from "../sections";

export default function OfficeHolidaysPage() {
  return <OfficePlaceholder section={sectionBySlug("ferie")} />;
}
