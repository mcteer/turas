import { HttpFailure } from "../../../lib/contracts/http";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentSession } from "../../../lib/server/auth/sessions";
import { csrfTokenForSession } from "../../../lib/server/auth/csrf";
import { getServerConfig } from "../../../lib/server/config";
import { withTransaction } from "../../../lib/server/db/client";
import { lockStaffingActor } from "../../../lib/server/staffing/policy";
import { isStaffingManager } from "../../../lib/server/staffing/read";

export async function staffingPageAccess(managerOnly: boolean | "finance" = false) {
  const session = await getCurrentSession(new Request(getServerConfig().TURAS_APP_ORIGIN,
    { headers: { cookie: (await cookies()).toString() } }));
  if (!session) redirect("/login");
  try { await withTransaction(db => lockStaffingActor(db, session, managerOnly === "finance" ? "finance" : managerOnly ? "manager" : "operational")); }
  catch (error) {
    if (error instanceof HttpFailure && error.status === 401) redirect("/login");
    return { allowed: false as const, message: error instanceof HttpFailure && error.status === 403 ?
      "Staffing access is not available for this account." : "Staffing is temporarily unavailable. Try again later." };
  }
  return { allowed: true as const, manager: isStaffingManager(session), csrfToken: csrfTokenForSession(session.token) };
}
