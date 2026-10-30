import { OfficePlaceholder } from "../placeholder";
import { sectionBySlug } from "../sections";

export default function OfficeSettingsPage() {
  return <OfficePlaceholder section={sectionBySlug("indstillinger")} />;
}
