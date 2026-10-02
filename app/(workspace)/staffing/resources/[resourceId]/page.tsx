import { StaffingUnavailable } from "../../unavailable";
import { StaffingResourceDetail } from "../../../../_components/staffing/resource-detail";
import { staffingPageAccess } from "../../access";
export default async function ResourcePage({ params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params, access = await staffingPageAccess();
  if (!access.allowed) return <StaffingUnavailable message={access.message} />;
  return <main className="profile-page"><StaffingResourceDetail resourceId={resourceId} csrfToken={access.csrfToken} /></main>;
}
