import type { CurrentSession } from "../auth/sessions";
import { withTransaction } from "../db/client";
import { lockStaffingActor, requireStaffingCapability } from "./policy";
import { isStaffingManager } from "./read";
export type StaffingNavigation = { resources: boolean; imports: boolean; finance: boolean };
/** Navigation is a live server projection. Domain reads/writes independently
 * authorize every request; hiding a menu never grants or substitutes authority. */
export async function staffingNavigation(actor: CurrentSession): Promise<StaffingNavigation> {
  if (actor.kind !== "internal") return { resources: false, imports: false, finance: false };
  try {
    return await withTransaction(async db => {
      await lockStaffingActor(db, actor, "operational");
      let finance = false;
      try { requireStaffingCapability(actor, "finance"); finance = true; } catch { /* operational only */ }
      return { resources: true, imports: isStaffingManager(actor), finance };
    });
  } catch {
    // Unavailable feature readiness/authority exposes no feature entry. Existing
    // workspace navigation remains usable during a feature-only outage.
    return { resources: false, imports: false, finance: false };
  }
}
