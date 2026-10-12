import { createHash, timingSafeEqual } from "node:crypto";
import type { ServerConfig } from "../config";
import { getServerConfig } from "../config";
import { query } from "../db/client";
import { DEMO_IDS } from "../bootstrap-ids";

export type DemoIdentity = {
  principalId: string;
  loginName: string;
  displayName: string;
  membershipId: string;
  workspaceId: string;
  kind: "internal" | "partner";
  role: "admin" | "member";
  workspaceClassification?: "primary" | "synthetic_pilot";
};

export function verifyConfiguredCredentials(
  username: string,
  password: string,
  config: ServerConfig,
): string | null {
  const provided = createHash("sha256").update(password).digest();
  const candidates = [
    [config.TURAS_DEMO_USERNAME, config.TURAS_DEMO_PASSWORD, DEMO_IDS.mcteer],
    [config.PANEL_USERNAME, config.PANEL_PASSWORD, DEMO_IDS.panel],
    [config.PARTNER_USERNAME, config.PARTNER_PASSWORD, DEMO_IDS.partner],
  ] as const;
  let match: string | null = null;
  for (const [name, secret, principalId] of candidates) {
    const expected = createHash("sha256").update(secret).digest();
    const passwordMatches = timingSafeEqual(provided, expected);
    if (username === name && passwordMatches) match = principalId;
  }
  return match;
}

export async function authenticateDemoPrincipal(username: string, password: string, workspaceSelection: "primary" | "pilot" = "primary"): Promise<DemoIdentity | null> {
  if (!["primary", "pilot"].includes(workspaceSelection)) return null;
  const config = getServerConfig();
  const principalId = verifyConfiguredCredentials(username, password, config);
  if (!principalId) return null;
  const result = await query<{
    principal_id: string; login_name: string; display_name: string; membership_id: string;
    workspace_classification: "primary" | "synthetic_pilot"; workspace_id: string; kind: "internal" | "partner"; role: "admin" | "member";
  }>(`
    SELECT p.id AS principal_id, p.login_name, p.display_name,
           m.id AS membership_id, m.workspace_id, m.kind, m.role, w.classification AS workspace_classification
    FROM principals p
    JOIN memberships m ON m.principal_id = p.id
    JOIN workspaces w ON w.id = m.workspace_id
    LEFT JOIN partner_organizations o ON o.id = m.partner_org_id AND o.workspace_id = m.workspace_id
    WHERE p.id = $1 AND p.login_name = $2 AND p.active AND m.active AND w.active
      AND (($3='primary' AND w.id=$4 AND w.classification='primary') OR
           ($3='pilot' AND w.classification='synthetic_pilot' AND w.pilot_environment_id=$5))
      AND (m.kind = 'internal' OR (m.kind = 'partner' AND o.active))
    LIMIT 1
  `, [principalId, username, workspaceSelection, DEMO_IDS.workspace, config.TURAS_ENVIRONMENT_ID]);
  const row = result.rows[0];
  return row ? {
    principalId: row.principal_id,
    loginName: row.login_name,
    displayName: row.display_name,
    membershipId: row.membership_id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    role: row.role,
    workspaceClassification: row.workspace_classification,
  } : null;
}
