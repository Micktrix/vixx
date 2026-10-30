import { OfficePlaceholder } from "../placeholder";
import { sectionBySlug } from "../sections";

export default function OfficeMessagesPage() {
  return <OfficePlaceholder section={sectionBySlug("beskeder")} />;
}
