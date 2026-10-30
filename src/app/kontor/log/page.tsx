import { OfficePlaceholder } from "../placeholder";
import { sectionBySlug } from "../sections";

export default function OfficeAuditLogPage() {
  return <OfficePlaceholder section={sectionBySlug("log")} />;
}
