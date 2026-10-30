import { OfficePlaceholder } from "../placeholder";
import { sectionBySlug } from "../sections";

export default function OfficeServicesPage() {
  return <OfficePlaceholder section={sectionBySlug("ydelser")} />;
}
