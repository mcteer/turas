import { StaffingUnavailable } from "../unavailable";
import { StaffingRoster } from "../../../_components/staffing/roster";
import { staffingPageAccess } from "../access";
export default async function ResourcesPage() {
  const access = await staffingPageAccess();
  if (!access.allowed) return <StaffingUnavailable message={access.message} />;
  return <main className="profile-page"><StaffingRoster manager={access.manager} csrfToken={access.csrfToken} /></main>;
}
