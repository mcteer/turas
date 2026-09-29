import { createHash,randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { HttpFailure,hiddenRecord } from "../../contracts/http";
import { conflictDecisionSchema,conflictFlagSchema,
  type conflictEndpointSchema } from "../../contracts/conflicts";
import { governedIdSchema } from "../../contracts/retrieval";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { requireSteward } from "../profiles/policy";
import { authorizeRetrievalScope,recheckRetrievalSource,
  type AuthorizedRetrievalScope } from "./policy";

type Endpoint = z.infer<typeof conflictEndpointSchema>;
type Row = { id: string; scope: "customer" | "shared"; workspace_id: string | null;
  customer_id: string | null; first_kind: Endpoint["kind"];
  first_revision_id: string; second_kind: Endpoint["kind"];
  second_revision_id: string; period_start: Date; period_end: Date;
  state: string; version: string; rationale: string };
const hash = (value: unknown) => createHash("sha256")
  .update(JSON.stringify(value)).digest("hex");

async function visibleEndpoint(client: PoolClient,scope: AuthorizedRetrievalScope,
  endpoint: Endpoint): Promise<boolean> {
  const rows = await client.query<{ id: string; source_generation: string;
    audience: string; content_digest: string; projection_contract: string }>(`
    SELECT id,source_generation,audience,content_digest,projection_contract
    FROM retrieval_sources WHERE environment_id=$1 AND source_kind=$2
      AND source_revision_id=$3 AND lifecycle_state='current'
      AND ((scope='shared' AND $4::boolean) OR
        (scope='customer' AND workspace_id=$5 AND customer_id=$6))
    ORDER BY id LIMIT 4`,
  [scope.environmentId,endpoint.kind,endpoint.revisionId,scope.includeShared,
    scope.workspaceId,scope.customerId]);
  for (const row of rows.rows) {
    if (await recheckRetrievalSource(client,{ id: row.id,kind: endpoint.kind,
      revisionId: endpoint.revisionId,generation: Number(row.source_generation),
      audience: row.audience,contentDigest: row.content_digest,
      projectionContract: row.projection_contract },scope)) return true;
  }
  return false;
}

async function authority(client: PoolClient,actor: CurrentSession,
  row: Pick<Row,"scope" | "customer_id">,decision: boolean) {
  const scope = await authorizeRetrievalScope(client,actor,
    row.scope === "shared" ? "shared" : "combined",row.customer_id ?? undefined);
  if (decision) {
    if (row.scope === "shared") {
      if (actor.kind !== "internal" || actor.role !== "admin") {
        throw new HttpFailure(403,"forbidden","Action not allowed");
      }
    } else await requireSteward(client,actor,row.customer_id!);
  }
  return scope;
}

function dto(row: Row) {
  return { id: row.id,scope: row.scope,customerId: row.customer_id,
    first: { kind: row.first_kind,revisionId: row.first_revision_id },
    second: { kind: row.second_kind,revisionId: row.second_revision_id },
    periodStart: new Date(row.period_start).toISOString().slice(0,10),
    periodEnd: new Date(row.period_end).toISOString().slice(0,10),
    state: row.state,version: Number(row.version),rationale: row.rationale };
}

export async function flagTypedConflict(client: PoolClient,actor: CurrentSession,raw: unknown) {
  const parsed = conflictFlagSchema.safeParse(raw);
  if (!parsed.success) throw new HttpFailure(422,"invalid_input","Invalid conflict request");
  const input = parsed.data;
  const scope = await authority(client,actor,{ scope: input.scope,
    customer_id: input.customerId ?? null },false);
  const requestDigest = hash(input);
  const receipt = await client.query<{ conflict_id: string; request_digest: string }>(`
    SELECT conflict_id,request_digest FROM evidence_conflict_target_receipts
    WHERE actor_membership_id=$1 AND idempotency_key=$2`,
  [actor.membershipId,input.idempotencyKey]);
  if (receipt.rows[0]) {
    if (receipt.rows[0].request_digest !== requestDigest) {
      throw new HttpFailure(409,"idempotency_conflict","Conflict key reused");
    }
    return { ...(await readTypedConflict(client,actor,receipt.rows[0].conflict_id)),replayed: true };
  }
  if (!await visibleEndpoint(client,scope,input.first) ||
      !await visibleEndpoint(client,scope,input.second)) throw hiddenRecord();
  const prior = await client.query<Row>(`SELECT * FROM evidence_conflict_targets
    WHERE environment_id=$1 AND scope=$2 AND workspace_id IS NOT DISTINCT FROM $3
      AND customer_id IS NOT DISTINCT FROM $4 AND state IN ('flagged','confirmed')
      AND ((first_kind=$5 AND first_revision_id=$6 AND
            second_kind=$7 AND second_revision_id=$8) OR
           (first_kind=$7 AND first_revision_id=$8 AND
            second_kind=$5 AND second_revision_id=$6))
    ORDER BY created_at LIMIT 1 FOR UPDATE`,
  [scope.environmentId,input.scope,scope.workspaceId,scope.customerId,
    input.first.kind,input.first.revisionId,input.second.kind,input.second.revisionId]);
  let row = prior.rows[0];
  if (!row) {
    const inserted = await client.query<Row>(`INSERT INTO evidence_conflict_targets
      (id,environment_id,scope,workspace_id,customer_id,first_kind,
       first_revision_id,second_kind,second_revision_id,period_start,period_end,
       state,rationale)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'flagged',$12) RETURNING *`,
    [randomUUID(),scope.environmentId,input.scope,scope.workspaceId,scope.customerId,
      input.first.kind,input.first.revisionId,input.second.kind,input.second.revisionId,
      input.periodStart,input.periodEnd,input.rationale]);
    row = inserted.rows[0];
  }
  await client.query(`INSERT INTO evidence_conflict_target_receipts
    (id,conflict_id,actor_membership_id,action,idempotency_key,
     request_digest,result_version)
    VALUES($1,$2,$3,'flag',$4,$5,$6)`,
  [randomUUID(),row.id,actor.membershipId,input.idempotencyKey,
    requestDigest,row.version]);
  return { ...dto(row),replayed: false };
}

export async function readTypedConflict(client: PoolClient,actor: CurrentSession,id: string) {
  if (!governedIdSchema.safeParse(id).success) throw hiddenRecord();
  const found = await client.query<Row>(`SELECT * FROM evidence_conflict_targets
    WHERE id=$1 AND environment_id=$2`,[id,getServerConfig().TURAS_ENVIRONMENT_ID]);
  const row = found.rows[0];
  if (!row || (row.scope === "customer" && row.workspace_id !== actor.workspaceId)) throw hiddenRecord();
  const scope = await authority(client,actor,row,false);
  const firstVisible = await visibleEndpoint(client,scope,{ kind: row.first_kind,
      revisionId: row.first_revision_id }) ||
      (actor.kind === "internal" && row.scope === "customer");
  const secondVisible = await visibleEndpoint(client,scope,{ kind: row.second_kind,
      revisionId: row.second_revision_id }) ||
      (actor.kind === "internal" && row.scope === "customer");
  if ((!firstVisible || !secondVisible) &&
      !(row.scope === "shared" && actor.kind === "internal" && actor.role === "admin")) {
    throw hiddenRecord();
  }
  return dto(row);
}

export async function listTypedConflicts(client: PoolClient,actor: CurrentSession,
  scopeKind: "customer" | "shared",customerId?: string) {
  const scope = await authorizeRetrievalScope(client,actor,
    scopeKind === "shared" ? "shared" : "combined",customerId);
  const rows = await client.query<Row>(`SELECT * FROM evidence_conflict_targets
    WHERE environment_id=$1 AND scope=$2 AND workspace_id IS NOT DISTINCT FROM $3
      AND customer_id IS NOT DISTINCT FROM $4 ORDER BY updated_at DESC,id DESC LIMIT 100`,
  [scope.environmentId,scopeKind,scopeKind === "shared" ? null : scope.workspaceId,
    scopeKind === "shared" ? null : scope.customerId]);
  const visible = [];
  for (const row of rows.rows) {
    const privileged = actor.kind === "internal" &&
      (row.scope === "customer" || actor.role === "admin");
    if (!privileged && (!await visibleEndpoint(client,scope,{ kind: row.first_kind,
        revisionId: row.first_revision_id }) ||
        !await visibleEndpoint(client,scope,{ kind: row.second_kind,
          revisionId: row.second_revision_id }))) continue;
    visible.push(dto(row));
    if (visible.length >= 20) break;
  }
  return visible;
}

export async function decideTypedConflict(client: PoolClient,actor: CurrentSession,
  id: string,raw: unknown) {
  if (!governedIdSchema.safeParse(id).success) throw hiddenRecord();
  const parsed = conflictDecisionSchema.safeParse(raw);
  if (!parsed.success) throw new HttpFailure(422,"invalid_input","Invalid conflict decision");
  const input = parsed.data;
  const found = await client.query<Row>(`SELECT * FROM evidence_conflict_targets
    WHERE id=$1 AND environment_id=$2 FOR UPDATE`,
  [id,getServerConfig().TURAS_ENVIRONMENT_ID]);
  const row = found.rows[0];
  if (!row || (row.scope === "customer" && row.workspace_id !== actor.workspaceId)) throw hiddenRecord();
  const scope = await authority(client,actor,row,true);
  const requestDigest = hash({ id,...input });
  const receipt = await client.query<{ request_digest: string; result_version: string }>(`
    SELECT request_digest,result_version FROM evidence_conflict_target_receipts
    WHERE actor_membership_id=$1 AND idempotency_key=$2`,
  [actor.membershipId,input.idempotencyKey]);
  if (receipt.rows[0]) {
    if (receipt.rows[0].request_digest !== requestDigest) {
      throw new HttpFailure(409,"idempotency_conflict","Conflict key reused");
    }
    return { ...dto(row),version: Number(receipt.rows[0].result_version),replayed: true };
  }
  if (Number(row.version) !== input.expectedVersion ||
      row.state !== (input.action === "confirm" ? "flagged" : "confirmed")) {
    throw new HttpFailure(409,"conflict_changed","Conflict changed");
  }
  const firstCurrent = await visibleEndpoint(client,scope,{ kind: row.first_kind,
    revisionId: row.first_revision_id });
  const secondCurrent = await visibleEndpoint(client,scope,{ kind: row.second_kind,
    revisionId: row.second_revision_id });
  if (input.action === "confirm" && (!firstCurrent || !secondCurrent)) throw hiddenRecord();
  if (input.action === "resolve" && firstCurrent && secondCurrent) {
    throw new HttpFailure(409,"unresolved_conflict",
      "Correct or withdraw a conflicting source before resolving");
  }
  const next = Number(row.version)+1;
  const state = input.action === "confirm" ? "confirmed" : "resolved";
  await client.query(`UPDATE evidence_conflict_targets SET state=$2,version=$3,
    rationale=$4,decision_actor_membership_id=$5,updated_at=now() WHERE id=$1`,
  [id,state,next,input.rationale,actor.membershipId]);
  await client.query(`INSERT INTO evidence_conflict_target_receipts
    (id,conflict_id,actor_membership_id,action,idempotency_key,
     request_digest,result_version)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,
  [randomUUID(),id,actor.membershipId,input.action,input.idempotencyKey,
    requestDigest,next]);
  return { ...dto({ ...row,state,version: String(next),rationale: input.rationale }),
    replayed: false };
}
