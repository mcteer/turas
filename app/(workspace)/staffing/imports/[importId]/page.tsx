import { StaffingUnavailable } from "../../unavailable";
import { StaffingImportReview } from "../../../../_components/staffing/import-review";
import { staffingPageAccess } from "../../access";
export default async function ImportPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params, access = await staffingPageAccess(true);
  if (!access.allowed) return <StaffingUnavailable message={access.message} />;
  return <main className="profile-page"><StaffingImportReview importId={importId} csrfToken={access.csrfToken} /></main>;
}
