import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { BOUNDARY_IDS } from "./identities";

// Public and synthetic fixtures only. These identifiers never reference the old demo.
export const PROFILE_FIXTURE_IDS = {
  cedarWorkloadWeb: "00000000-0000-4000-8000-000000000401",
  cedarWorkloadCommerce: "00000000-0000-4000-8000-000000000402",
  cedarProductWeb: "00000000-0000-4000-8000-000000000411",
  cedarProductCommerce: "00000000-0000-4000-8000-000000000412",
  ownPending: "00000000-0000-4000-8000-000000000421",
  otherPending: "00000000-0000-4000-8000-000000000422",
  acceptedDelivery: "00000000-0000-4000-8000-000000000423",
  internalOperations: "00000000-0000-4000-8000-000000000424",
  publicSource: "00000000-0000-4000-8000-000000000431",
} as const;

export const PROFILE_FIXTURE = {
  clock: "2026-09-27T12:00:00.000Z",
  workspaces: [
    { id: DEMO_IDS.workspace, name: "Synthetic Vercel workspace" },
    { id: BOUNDARY_IDS.otherWorkspace, name: "Isolated synthetic workspace" },
  ],
  partnerOrganizations: [
    { id: DEMO_IDS.partnerOrganization, workspaceId: DEMO_IDS.workspace },
    { id: BOUNDARY_IDS.otherPartnerOrganization, workspaceId: BOUNDARY_IDS.otherWorkspace },
  ],
  customers: [
    { id: DEMO_IDS.sharedCustomer, workspaceId: DEMO_IDS.workspace, name: "Cedar", grantedToPartner: true },
    { id: DEMO_IDS.deniedCustomer, workspaceId: DEMO_IDS.workspace, name: "Birch", grantedToPartner: false },
  ],
  workloads: [
    { id: PROFILE_FIXTURE_IDS.cedarWorkloadWeb, customerId: DEMO_IDS.sharedCustomer, name: "Public web" },
    { id: PROFILE_FIXTURE_IDS.cedarWorkloadCommerce, customerId: DEMO_IDS.sharedCustomer, name: "Commerce" },
  ],
  submissions: [
    { id: PROFILE_FIXTURE_IDS.ownPending, actorId: DEMO_IDS.partnerMembership, state: "pending", text: "Synthetic partner proposal" },
    { id: PROFILE_FIXTURE_IDS.otherPending, actorId: DEMO_IDS.panelMembership, state: "pending", text: "Synthetic internal proposal" },
    { id: PROFILE_FIXTURE_IDS.acceptedDelivery, actorId: DEMO_IDS.panelMembership, state: "accepted", text: "Synthetic delivery fact" },
    { id: PROFILE_FIXTURE_IDS.internalOperations, actorId: DEMO_IDS.panelMembership, state: "accepted", text: "INTERNAL_OPERATIONS_SENTINEL_DO_NOT_PROJECT" },
  ],
  publicSource: {
    id: PROFILE_FIXTURE_IDS.publicSource,
    title: "Example public product documentation",
    location: "https://example.com/public-product-documentation",
    passage: "Synthetic public research passage for deterministic tests.",
    publicationDate: "2026-09-01",
    retrievalDate: "2026-09-27",
  },
} as const;

import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { CurrentSession } from "../../lib/server/auth/sessions";

export async function createProfileTestSession(client: PoolClient,
  login: "panel" | "mcteer" | "partner"): Promise<CurrentSession> {
  const identity = {
    panel: [DEMO_IDS.panel, DEMO_IDS.panelMembership, "internal", "member"],
    mcteer: [DEMO_IDS.mcteer, DEMO_IDS.mcteerMembership, "internal", "admin"],
    partner: [DEMO_IDS.partner, DEMO_IDS.partnerMembership, "partner", "member"],
  }[login] as [string, string, CurrentSession["kind"], CurrentSession["role"]];
  const sessionId = randomUUID();
  await client.query(`INSERT INTO login_sessions(id,principal_id,token_hash,expires_at)
    VALUES ($1,$2,$3,now()+interval '1 hour')`,
  [sessionId, identity[0], createHash("sha256").update(sessionId).digest("hex")]);
  return { sessionId, token: "fixture", expiresAt: new Date(Date.now() + 3_600_000),
    principalId: identity[0], membershipId: identity[1], workspaceId: DEMO_IDS.workspace,
    loginName: login, displayName: login, kind: identity[2], role: identity[3] };
}
