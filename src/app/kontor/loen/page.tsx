import { OfficePlaceholder } from "../placeholder";
import { sectionBySlug } from "../sections";

export default function OfficePayPage() {
  return <OfficePlaceholder section={sectionBySlug("loen")} />;
}
