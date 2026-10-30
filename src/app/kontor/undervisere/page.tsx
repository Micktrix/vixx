import { OfficePlaceholder } from "../placeholder";
import { sectionBySlug } from "../sections";

export default function OfficeInstructorsPage() {
  return <OfficePlaceholder section={sectionBySlug("undervisere")} />;
}
