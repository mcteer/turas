import { StaffingDemandEditor } from "../../../../../../_components/staffing/demand-editor";
import { staffingPageAccess } from "../../../../../staffing/access";
import { StaffingUnavailable } from "../../../../../staffing/unavailable";
export default async function EngagementStaffingPage({ params }: { params: Promise<{ customerId: string; engagementId: string }> }) {
  const access = await staffingPageAccess();
  if (!access.allowed) return <StaffingUnavailable message={access.message} />;
  const { customerId, engagementId } = await params;
  return <main className="profile-page"><StaffingDemandEditor customerId={customerId} engagementId={engagementId} csrfToken={access.csrfToken} financeAllowed={access.manager} /></main>;
}
