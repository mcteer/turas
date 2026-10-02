import type { PoolClient } from "pg";
import { getServerConfig } from "../config";
import { staffingSha256 } from "./commands";
import type { StaffingActor } from "./policy";

/** Registry range mutex: native comparisons hold SHARE before source discovery;
 * create/identity-state writers hold UPDATE before resource rows. It covers new
 * and newly reactivated resources where a row lock over the active pool cannot. */
export async function lockStaffingResourcePool(db: PoolClient, actor: StaffingActor, mode: "SHARE" | "UPDATE") {
  const digest = staffingSha256({ environment: getServerConfig().TURAS_ENVIRONMENT_ID, workspace: actor.workspaceId,
    operation: "staffing_resource_pool" });
  const mutex = BigInt.asIntN(64, BigInt(`0x${digest.slice(0, 16)}`)).toString();
  await db.query(mode === "SHARE" ? "SELECT pg_advisory_xact_lock_shared($1::bigint)" : "SELECT pg_advisory_xact_lock($1::bigint)", [mutex]);
}
