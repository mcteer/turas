import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z, ZodError } from "zod";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import {
  knowledgeCandidateSchema, knowledgeDecisionSchema, knowledgeRevisionSchema,
  knowledgeWithdrawSchema, sanitizedKnowledgeSchema, knowledgeLineageSchema,
} from "../../contracts/knowledge";
import { governedIdSchema, writeEnvelopeSchema } from "../../contracts/retrieval";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { sharedPublicationQuality } from "./quality";
import { assertExactKnowledgeLineage, assertNoDirectIdentifiers,
  lockKnowledgeAuthor, requireKnowledgePublisher } from "./policy";
import { materializeSharedProjection,retireRetrievalProjection } from "../retrieval/projections";
import { enqueuePlanCleanupForSource } from "../plans/cleanup";

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  try { return schema.parse(input); }
  catch (error) {
    if (error instanceof ZodError) throw new HttpFailure(422,"invalid_input","Invalid knowledge request");
    throw error;
  }
}
function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
type Candidate = { id: string; customer_id: string; workspace_id: string;
  author_membership_id: string; state: string; current_revision_number: number };
type Revision = { id: string; revision_number: number; content_digest: string;
  payload: unknown };

async function candidate(client: PoolClient,id: string,lock = true): Promise<Candidate> {
  const found = await client.query<Candidate>(`SELECT id,customer_id,workspace_id,
    author_membership_id,state,current_revision_number FROM knowledge_contributions
    WHERE id=$1 AND environment_id=$2 ${lock ? "FOR UPDATE" : ""}`,
  [id,getServerConfig().TURAS_ENVIRONMENT_ID]);
  if (!found.rows[0]) throw hiddenRecord();
  return found.rows[0];
}

async function latest(client: PoolClient,id: string): Promise<Revision> {
  const found = await client.query<Revision>(`SELECT r.id,r.revision_number,r.content_digest,
    p.payload FROM knowledge_revisions r JOIN knowledge_revision_payloads p ON p.revision_id=r.id
    WHERE r.contribution_id=$1 ORDER BY r.revision_number DESC LIMIT 1`,[id]);
  if (!found.rows[0]) throw new HttpFailure(409,"candidate_changed","Candidate changed");
  return found.rows[0];
}

async function lineageFor(client: PoolClient,revisionId: string): Promise<z.infer<typeof knowledgeLineageSchema>[]> {
  const rows = await client.query<{ source_kind: string; source_revision_id: string;
    source_generation: string; source_digest: string; rights_basis: string }>(`
    SELECT source_kind,source_revision_id,source_generation,source_digest,rights_basis
    FROM knowledge_lineage WHERE revision_id=$1 ORDER BY ordinal`,[revisionId]);
  return rows.rows.map((row) => parse(knowledgeLineageSchema,{
    sourceKind: row.source_kind,sourceRevisionId: row.source_revision_id,
    sourceGeneration: Number(row.source_generation),sourceDigest: row.source_digest,
    rightsBasis: row.rights_basis,
  }));
}

async function appendRevision(client: PoolClient,actor: CurrentSession,contributionId: string,
  number: number,payload: z.infer<typeof sanitizedKnowledgeSchema>,
  lineage: z.infer<typeof knowledgeLineageSchema>[],key: string,requestDigest: string): Promise<Revision> {
  const revisionId = randomUUID();
  const contentDigest = digest(payload);
  await client.query(`INSERT INTO knowledge_revisions
    (id,contribution_id,revision_number,content_digest,author_membership_id,
     idempotency_key,request_digest) VALUES($1,$2,$3,$4,$5,$6,$7)`,
  [revisionId,contributionId,number,contentDigest,actor.membershipId,key,requestDigest]);
  await client.query("INSERT INTO knowledge_revision_payloads(revision_id,payload) VALUES($1,$2)",
    [revisionId,JSON.stringify(payload)]);
  for (const [index,item] of lineage.entries()) {
    await client.query(`INSERT INTO knowledge_lineage
      (id,contribution_id,revision_id,ordinal,source_kind,source_revision_id,
       source_generation,source_digest,rights_basis)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [randomUUID(),contributionId,revisionId,index+1,item.sourceKind,item.sourceRevisionId,
      item.sourceGeneration,item.sourceDigest,item.rightsBasis]);
  }
  return { id: revisionId,revision_number: number,content_digest: contentDigest,payload };
}

export async function createKnowledgeCandidate(client: PoolClient,actor: CurrentSession,
  input: unknown) {
  const command = parse(knowledgeCandidateSchema,input);
  await assertExactKnowledgeLineage(client,actor,command.customerId,command.lineage);
  const requestDigest = digest(command);
  const prior = await client.query<{ id: string; request_digest: string }>(`
    SELECT id,request_digest FROM knowledge_contributions
    WHERE environment_id=$1 AND author_membership_id=$2 AND idempotency_key=$3`,
  [getServerConfig().TURAS_ENVIRONMENT_ID,actor.membershipId,command.idempotencyKey]);
  if (prior.rows[0]) {
    if (prior.rows[0].request_digest !== requestDigest) throw new HttpFailure(409,"idempotency_conflict","Request key reused");
    const original = await client.query<{ revision_number: number; content_digest: string }>(`
      SELECT revision_number,content_digest FROM knowledge_revisions
      WHERE contribution_id=$1 AND author_membership_id=$2 AND idempotency_key=$3`,
    [prior.rows[0].id,actor.membershipId,command.idempotencyKey]);
    return { id: prior.rows[0].id,revision: original.rows[0].revision_number,
      digest: original.rows[0].content_digest,state: "draft" as const };
  }
  const id = randomUUID();
  const inserted = await client.query<{ id: string }>(`INSERT INTO knowledge_contributions
    (id,environment_id,workspace_id,customer_id,author_membership_id,idempotency_key,request_digest)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (environment_id,author_membership_id,idempotency_key) DO NOTHING
    RETURNING id`,
  [id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,command.customerId,
    actor.membershipId,command.idempotencyKey,requestDigest]);
  if (!inserted.rows[0]) {
    const replay = await client.query<{ id: string; request_digest: string }>(`
      SELECT id,request_digest FROM knowledge_contributions
      WHERE environment_id=$1 AND author_membership_id=$2 AND idempotency_key=$3`,
    [getServerConfig().TURAS_ENVIRONMENT_ID,actor.membershipId,command.idempotencyKey]);
    if (replay.rows[0]?.request_digest !== requestDigest) {
      throw new HttpFailure(409,"idempotency_conflict","Request key reused");
    }
    const original = await client.query<{ revision_number: number; content_digest: string }>(`
      SELECT revision_number,content_digest FROM knowledge_revisions
      WHERE contribution_id=$1 AND author_membership_id=$2 AND idempotency_key=$3`,
    [replay.rows[0].id,actor.membershipId,command.idempotencyKey]);
    if (!original.rows[0]) throw new HttpFailure(409,"candidate_changed","Candidate changed");
    return { id: replay.rows[0].id,revision: original.rows[0].revision_number,
      digest: original.rows[0].content_digest,state: "draft" as const };
  }
  const revision = await appendRevision(client,actor,id,1,command.payload,command.lineage,
    command.idempotencyKey,requestDigest);
  return { id,revision: 1,digest: revision.content_digest,state: "draft" as const };
}

export async function reviseKnowledgeCandidate(client: PoolClient,actor: CurrentSession,
  id: string,input: unknown) {
  parse(governedIdSchema,id);
  const command = parse(knowledgeRevisionSchema,input);
  const found = await candidate(client,id);
  if (found.author_membership_id !== actor.membershipId &&
      !(actor.kind === "internal" && actor.role === "admin")) throw hiddenRecord();
  await assertExactKnowledgeLineage(client,actor,found.customer_id,command.lineage);
  const requestDigest = digest(command);
  const prior = await client.query<{ revision_number: number; content_digest: string;
    request_digest: string }>(`SELECT revision_number,content_digest,request_digest
    FROM knowledge_revisions WHERE contribution_id=$1 AND author_membership_id=$2
      AND idempotency_key=$3`,[id,actor.membershipId,command.idempotencyKey]);
  if (prior.rows[0]) {
    if (prior.rows[0].request_digest !== requestDigest) throw new HttpFailure(409,"idempotency_conflict","Request key reused");
    return { id,revision: prior.rows[0].revision_number,digest: prior.rows[0].content_digest,
      state: found.state };
  }
  const current = await latest(client,id);
  if (found.current_revision_number !== command.expectedRevision ||
      current.content_digest !== command.expectedDigest ||
      !["draft","submitted","rejected","closed"].includes(found.state)) {
    throw new HttpFailure(409,"candidate_changed","Candidate changed");
  }
  const revision = await appendRevision(client,actor,id,current.revision_number+1,
    command.payload,command.lineage,command.idempotencyKey,requestDigest);
  await client.query(`UPDATE knowledge_contributions SET current_revision_number=$2,
    state='draft',updated_at=now() WHERE id=$1`,[id,revision.revision_number]);
  return { id,revision: revision.revision_number,digest: revision.content_digest,
    state: "draft" as const };
}

export async function submitKnowledgeCandidate(client: PoolClient,actor: CurrentSession,
  id: string,input: unknown) {
  parse(governedIdSchema,id);
  const command = parse(writeEnvelopeSchema,input);
  const found = await candidate(client,id);
  if (found.author_membership_id !== actor.membershipId) throw hiddenRecord();
  await lockKnowledgeAuthor(client,actor,found.customer_id);
  const requestDigest = digest(command);
  const prior = await client.query<{ id: string; contribution_id: string; request_digest: string;
    revision_number: number; content_digest: string }>(`
    SELECT receipt.id,receipt.contribution_id,receipt.request_digest,r.revision_number,r.content_digest
    FROM knowledge_submit_receipts receipt
    JOIN knowledge_revisions r ON r.id=receipt.revision_id
    WHERE receipt.actor_membership_id=$1 AND receipt.idempotency_key=$2`,
  [actor.membershipId,command.idempotencyKey]);
  if (prior.rows[0]) {
    if (prior.rows[0].contribution_id !== id || prior.rows[0].request_digest !== requestDigest) {
      throw new HttpFailure(409,"idempotency_conflict","Request key reused");
    }
    return { id,revision: prior.rows[0].revision_number,
      digest: prior.rows[0].content_digest,state: "submitted" as const };
  }
  const revision = await latest(client,id);
  if (found.current_revision_number !== command.expectedRevision ||
      revision.content_digest !== command.expectedDigest || found.state !== "draft") {
    throw new HttpFailure(409,"candidate_changed","Candidate changed");
  }
  await assertExactKnowledgeLineage(client,actor,found.customer_id,
    await lineageFor(client,revision.id));
  await assertNoDirectIdentifiers(client,found.customer_id,
    parse(sanitizedKnowledgeSchema,revision.payload));
  await client.query(`INSERT INTO knowledge_submit_receipts
    (id,contribution_id,revision_id,actor_membership_id,idempotency_key,request_digest)
    VALUES($1,$2,$3,$4,$5,$6)`,
  [randomUUID(),id,revision.id,actor.membershipId,command.idempotencyKey,requestDigest]);
  await client.query(`UPDATE knowledge_contributions SET state='submitted',updated_at=now()
    WHERE id=$1`,[id]);
  return { id,revision: revision.revision_number,digest: revision.content_digest,
    state: "submitted" as const };
}

export async function decideKnowledgeCandidate(client: PoolClient,actor: CurrentSession,
  id: string,input: unknown) {
  parse(governedIdSchema,id);
  const command = parse(knowledgeDecisionSchema,input);
  requireKnowledgePublisher(actor);
  const found = await candidate(client,id);
  await lockKnowledgeAuthor(client,actor,found.customer_id);
  const requestDigest = digest(command);
  const prior = await client.query<{ id: string; request_digest: string; revision_id: string;
    action: string }>(`SELECT id,request_digest,revision_id,action FROM knowledge_decisions
    WHERE actor_membership_id=$1 AND action=$2 AND idempotency_key=$3`,
  [actor.membershipId,command.action,command.idempotencyKey]);
  if (prior.rows[0]) {
    if (prior.rows[0].request_digest !== requestDigest) throw new HttpFailure(409,"idempotency_conflict","Request key reused");
    return { decisionId: prior.rows[0].id,revisionId: prior.rows[0].revision_id,
      action: prior.rows[0].action,replayed: true };
  }
  const revision = await latest(client,id);
  if (found.state !== "submitted" || found.current_revision_number !== command.expectedRevision ||
      revision.content_digest !== command.expectedDigest) {
    throw new HttpFailure(409,"candidate_changed","Candidate changed");
  }
  const lineage = await lineageFor(client,revision.id);
  await assertExactKnowledgeLineage(client,actor,found.customer_id,lineage);
  if (command.action === "publish") {
    await assertNoDirectIdentifiers(client,found.customer_id,
      parse(sanitizedKnowledgeSchema,revision.payload));
  }
  const publication = await client.query<{ id: string; head_generation: string;
    revision_id:string;state: string }>(`SELECT id,head_generation,revision_id,state FROM knowledge_publications
    WHERE contribution_id=$1 FOR UPDATE`,[id]);
  const head = publication.rows[0];
  if ((head && Number(head.head_generation) !== command.expectedPublicationGeneration) ||
      (!head && command.expectedPublicationGeneration !== undefined)) {
    throw new HttpFailure(409,"publication_changed","Publication changed");
  }
  const decisionId = randomUUID();
  await client.query(`INSERT INTO knowledge_decisions
    (id,contribution_id,revision_id,actor_membership_id,action,expected_revision,
     expected_digest,expected_publication_generation,idempotency_key,request_digest,
     rights_attested,sanitization_rationale,checklist)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
  [decisionId,id,revision.id,actor.membershipId,command.action,command.expectedRevision,
    command.expectedDigest,command.expectedPublicationGeneration ?? null,command.idempotencyKey,
    requestDigest,command.action === "publish",command.sanitizationRationale,
    JSON.stringify(command.action === "publish" ? command.checklist : {})]);
  if (command.action === "publish") {
    const at = new Date();
    const quality = await sharedPublicationQuality(client,revision.id,at);
    if (head) {
      await client.query(`UPDATE knowledge_publications SET revision_id=$2,
        head_generation=head_generation+1,state='published',public_quality=$3,
        published_at=$4,updated_at=$4 WHERE id=$1`,
      [head.id,revision.id,JSON.stringify(quality),at]);
      if (head.revision_id!==revision.id) await enqueuePlanCleanupForSource(client,
        "shared_knowledge",head.revision_id);
    } else {
      await client.query(`INSERT INTO knowledge_publications
        (id,environment_id,contribution_id,revision_id,head_generation,state,
         public_quality,published_at) VALUES($1,$2,$3,$4,1,'published',$5,$6)`,
      [randomUUID(),getServerConfig().TURAS_ENVIRONMENT_ID,id,revision.id,
        JSON.stringify(quality),at]);
    }
    await client.query("UPDATE knowledge_contributions SET state='closed',updated_at=now() WHERE id=$1",[id]);
    if (!await materializeSharedProjection(client,revision.id)) {
      throw new HttpFailure(409,"publication_changed","Publication source changed");
    }
  } else {
    await client.query("UPDATE knowledge_contributions SET state='rejected',updated_at=now() WHERE id=$1",[id]);
  }
  return { decisionId,revisionId: revision.id,action: command.action,replayed: false };
}

export async function withdrawKnowledge(client: PoolClient,actor: CurrentSession,
  publicationId: string,input: unknown) {
  parse(governedIdSchema,publicationId);
  const command = parse(knowledgeWithdrawSchema,input);
  requireKnowledgePublisher(actor);
  const found = await client.query<{ id: string; contribution_id: string; revision_id: string;
    head_generation: string; state: string; customer_id: string }>(`
    SELECT p.id,p.contribution_id,p.revision_id,p.head_generation,p.state,c.customer_id
    FROM knowledge_publications p JOIN knowledge_contributions c ON c.id=p.contribution_id
    WHERE p.id=$1 AND p.environment_id=$2 FOR UPDATE OF p`,
  [publicationId,getServerConfig().TURAS_ENVIRONMENT_ID]);
  const row = found.rows[0];
  if (!row) throw hiddenRecord();
  await lockKnowledgeAuthor(client,actor,row.customer_id);
  const requestDigest = digest(command);
  const prior = await client.query<{ id: string; request_digest: string }>(`
    SELECT id,request_digest FROM knowledge_decisions
    WHERE actor_membership_id=$1 AND action='withdraw' AND idempotency_key=$2`,
  [actor.membershipId,command.idempotencyKey]);
  if (prior.rows[0]) {
    if (prior.rows[0].request_digest !== requestDigest) throw new HttpFailure(409,"idempotency_conflict","Request key reused");
    return { decisionId: prior.rows[0].id,replayed: true };
  }
  const revision = await latest(client,row.contribution_id);
  if (row.state !== "published" || Number(row.head_generation) !== command.expectedPublicationGeneration ||
      revision.revision_number !== command.expectedRevision ||
      revision.content_digest !== command.expectedDigest || row.revision_id !== revision.id) {
    throw new HttpFailure(409,"publication_changed","Publication changed");
  }
  const decisionId = randomUUID();
  await client.query(`INSERT INTO knowledge_decisions
    (id,contribution_id,revision_id,actor_membership_id,action,expected_revision,
     expected_digest,expected_publication_generation,idempotency_key,request_digest,
     rights_attested,sanitization_rationale,checklist)
    VALUES($1,$2,$3,$4,'withdraw',$5,$6,$7,$8,$9,false,$10,'{}'::jsonb)`,
  [decisionId,row.contribution_id,row.revision_id,actor.membershipId,
    command.expectedRevision,command.expectedDigest,command.expectedPublicationGeneration,
    command.idempotencyKey,requestDigest,command.rationale]);
  await client.query(`UPDATE knowledge_publications SET state='withdrawn',
    head_generation=head_generation+1,updated_at=now() WHERE id=$1`,[publicationId]);
  await retireRetrievalProjection(client,"published_shared",row.revision_id);
  await enqueuePlanCleanupForSource(client,"shared_knowledge",row.revision_id);
  return { decisionId,replayed: false };
}
