import { OfficePlaceholder } from "../placeholder";
import { sectionBySlug } from "../sections";

export default function OfficeApprovalsPage() {
  return <OfficePlaceholder section={sectionBySlug("godkendelser")} />;
}
