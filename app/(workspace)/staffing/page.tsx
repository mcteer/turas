import { StaffingUnavailable } from "./unavailable";
import { staffingPageAccess } from "./access";
import { StaffingOperations } from "../../_components/staffing/operations";
export default async function StaffingPage() {
  const access = await staffingPageAccess();
  if (!access.allowed) return <StaffingUnavailable message={access.message} />;
  return <main className="profile-page"><StaffingOperations /></main>;
}
