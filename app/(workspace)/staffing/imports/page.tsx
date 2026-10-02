import { StaffingUnavailable } from "../unavailable";
import { StaffingImports } from "../../../_components/staffing/import-review";
import { staffingPageAccess } from "../access";
export default async function ImportsPage() {
  const access = await staffingPageAccess(true);
  if (!access.allowed) return <StaffingUnavailable message={access.message} />;
  return <main className="profile-page"><StaffingImports csrfToken={access.csrfToken} /></main>;
}
