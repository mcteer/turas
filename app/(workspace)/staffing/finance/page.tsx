import { StaffingFinance } from "../../../_components/staffing/finance";
import { staffingPageAccess } from "../access";
import { StaffingUnavailable } from "../unavailable";
export default async function StaffingFinancePage() {
  const access = await staffingPageAccess("finance");
  if (!access.allowed) return <StaffingUnavailable message={access.message} />;
  return <main className="profile-page"><StaffingFinance csrfToken={access.csrfToken} /></main>;
}
