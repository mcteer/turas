import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CurrentSession } from "../../lib/server/auth/sessions";
import { withTestDatabase } from "../fixtures/database";
import { createKnowledgeCandidate, decideKnowledgeCandidate,
  reviseKnowledgeCandidate, submitKnowledgeCandidate, withdrawKnowledge } from
  "../../lib/server/knowledge/service";
import { readPublishedKnowledge } from "../../lib/server/knowledge/read";
import { recheckRetrievalSource } from "../../lib/server/retrieval/policy";
import { readKnowledgeCandidate, readKnowledgeLineage } from "../../lib/server/knowledge/lineage";
import { suspendStaleKnowledge } from "../../lib/server/knowledge/suspension";
import { readKnowledgeImpact } from "../../lib/server/knowledge/impact";
import { materializeCurrentProjection } from "../../lib/server/retrieval/projections";
import { flagTypedConflict,decideTypedConflict } from "../../lib/server/retrieval/conflicts";
import { currentIndexPassages } from "../../scripts/retrieval-worker";

const payload = { title: "Synthetic build timing", productVersion: "2026.9",
  problem: "Builds can take longer than expected",prerequisites: "A supported build pipeline",
  solution: "Measure each build stage",reasoning: "Stage timing isolates the slowest step",
  applicability: "Build pipelines",limitations: "Validate for each workload",
  validation: "Compare stage durations before and after" };
const checklist = { namesAndDomainsRemoved: true,repositoriesAndLinksRemoved: true,
  peopleAndCommercialDetailsRemoved: true,
  identifyingConfigurationAndOutcomesRemoved: true,countsAndCombinedInferenceReviewed: true };
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

describe("shared publication boundary", () => {
  it("publishes only an exact reviewed revision and returns identical public DTOs across workspaces", async () => {
    const environment = process.env.TURAS_TEST_ENVIRONMENT_ID!;
    for (const [key,value] of Object.entries({
      DATABASE_URL: "postgres://localhost/turas_unused",
      DATABASE_URL_UNPOOLED: "postgres://localhost/turas_unused",
      TURAS_ENVIRONMENT_ID: environment,TURAS_APP_ORIGIN: "http://127.0.0.1:3000",
      TURAS_DEMO_USERNAME: "mcteer",TURAS_DEMO_PASSWORD: "synthetic",
      PANEL_USERNAME: "panel",PANEL_PASSWORD: "synthetic",
      PARTNER_USERNAME: "partner",PARTNER_PASSWORD: "synthetic",
      TURAS_MAINTENANCE_SECRET: "s".repeat(32),
    })) vi.stubEnv(key,value);
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const workspace = randomUUID();
          const otherWorkspace = randomUUID();
          const customer = randomUUID();
          const authorPrincipal = randomUUID();
          const adminPrincipal = randomUUID();
          const readerPrincipal = randomUUID();
          const partnerPrincipal = randomUUID();
          const authorMember = randomUUID();
          const adminMember = randomUUID();
          const readerMember = randomUUID();
          const partnerMember = randomUUID();
          const partnerOrg = randomUUID();
          const record = randomUUID();
          const revision = randomUUID();
          const sourceDigest = sha("synthetic accepted source");
          await client.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic source'),($2,'Synthetic reader')",
            [workspace,otherWorkspace]);
          for (const [id,name] of [[authorPrincipal,"author"],[adminPrincipal,"publisher"],
            [readerPrincipal,"reader"],[partnerPrincipal,"partner"]]) {
            await client.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,$2)",
              [id,`${name}-${id}`]);
          }
          await client.query(`INSERT INTO partner_organizations(id,workspace_id,name)
            VALUES($1,$2,'Synthetic partner')`,[partnerOrg,otherWorkspace]);
          await client.query(`INSERT INTO memberships(id,principal_id,workspace_id,kind,role)
            VALUES($1,$2,$3,'internal','member'),($4,$5,$3,'internal','admin'),
              ($6,$7,$8,'internal','member')`,
          [authorMember,authorPrincipal,workspace,adminMember,adminPrincipal,
            readerMember,readerPrincipal,otherWorkspace]);
          await client.query(`INSERT INTO memberships
            (id,principal_id,workspace_id,kind,role,partner_org_id)
            VALUES($1,$2,$3,'partner','member',$4)`,
          [partnerMember,partnerPrincipal,otherWorkspace,partnerOrg]);
          await client.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
            VALUES($1,$2,'Private Juniper Sentinel',true)`,[customer,workspace]);
          await client.query(`INSERT INTO profile_records(id,workspace_id,customer_id,kind,created_by)
            VALUES($1,$2,$3,'claim',$4)`,[record,workspace,customer,authorMember]);
          await client.query(`INSERT INTO profile_revisions
            (id,record_id,workspace_id,customer_id,revision_number,payload_schema_version,
             payload,quality_input,author_membership_id,origin,audience,data_category,content_digest)
            VALUES($1,$2,$3,$4,1,'profile-v1',$5,'{}'::jsonb,$6,'manual',
              'internal','internal_operations',$7)`,
          [revision,record,workspace,customer,JSON.stringify({ kind: "claim",
            text: "synthetic accepted source",sourceType: "manual" }),authorMember,sourceDigest]);
          await client.query(`INSERT INTO profile_review_decisions
            (revision_id,decision,reviewer_membership_id,rationale,command_receipt_id)
            VALUES($1,'accept',$2,'Synthetic review',$3)`,[revision,adminMember,randomUUID()]);
          await client.query("UPDATE profile_records SET current_accepted_revision_id=$2 WHERE id=$1",
            [record,revision]);
          async function actor(principalId: string,membershipId: string,workspaceId: string,
            role: "admin" | "member"): Promise<CurrentSession> {
            const sessionId = randomUUID();
            await client.query(`INSERT INTO login_sessions(id,principal_id,token_hash,expires_at)
              VALUES($1,$2,$3,now()+interval '1 hour')`,
            [sessionId,principalId,sha(sessionId)]);
            return { sessionId,principalId,membershipId,workspaceId,kind: "internal",role,
              loginName: "synthetic",displayName: "Synthetic",token: "synthetic",
              expiresAt: new Date(Date.now()+3_600_000) };
          }
          const author = await actor(authorPrincipal,authorMember,workspace,"member");
          const admin = await actor(adminPrincipal,adminMember,workspace,"admin");
          const reader = await actor(readerPrincipal,readerMember,otherWorkspace,"member");
          const partner = { ...await actor(partnerPrincipal,partnerMember,otherWorkspace,"member"),
            kind: "partner" as const };
          const lineage = [{ sourceKind: "accepted_profile",sourceRevisionId: revision,
            sourceGeneration: 1,sourceDigest,rightsBasis: "Synthetic reusable source" }];
          const draft = await createKnowledgeCandidate(client,author,
            { idempotencyKey: "draft-1",customerId: customer,payload,lineage });
          expect(draft.state).toBe("draft");
          const identifierDraft = await createKnowledgeCandidate(client,author,{
            idempotencyKey: "draft-identifier",customerId: customer,
            payload: { ...payload,problem: "Private Juniper Sentinel needs faster builds" },lineage });
          await expect(submitKnowledgeCandidate(client,author,identifierDraft.id,{
            idempotencyKey: "submit-identifier",expectedRevision: 1,
            expectedDigest: identifierDraft.digest })).rejects.toMatchObject({ status: 422 });
          await expect(readKnowledgeCandidate(client,reader,draft.id))
            .rejects.toMatchObject({ status: 404 });
          await expect(readKnowledgeLineage(client,reader,draft.id))
            .rejects.toMatchObject({ status: 404 });
          const rejectedDraft = await createKnowledgeCandidate(client,author,{
            idempotencyKey: "draft-reject",customerId: customer,payload,lineage });
          await submitKnowledgeCandidate(client,author,rejectedDraft.id,{
            idempotencyKey: "submit-reject",expectedRevision: 1,
            expectedDigest: rejectedDraft.digest });
          const rejection = await decideKnowledgeCandidate(client,admin,rejectedDraft.id,{
            idempotencyKey: "reject-1",expectedRevision: 1,expectedDigest: rejectedDraft.digest,
            action: "reject",sanitizationRationale: "Needs clearer limitations" });
          expect(rejection.action).toBe("reject");
          expect((await readKnowledgeCandidate(client,author,rejectedDraft.id)).state).toBe("rejected");
          expect((await reviseKnowledgeCandidate(client,author,rejectedDraft.id,{
            idempotencyKey: "reject-revision",expectedRevision: 1,
            expectedDigest: rejectedDraft.digest,
            payload: { ...payload,limitations: "Requires workload-specific validation" },
            lineage })).state).toBe("draft");
          await expect(submitKnowledgeCandidate(client,author,draft.id,{ idempotencyKey: "submit-1",
            expectedRevision: 1,expectedDigest: "a".repeat(64) }))
            .rejects.toMatchObject({ status: 409 });
          await submitKnowledgeCandidate(client,author,draft.id,{ idempotencyKey: "submit-1",
            expectedRevision: 1,expectedDigest: draft.digest });
          expect((await submitKnowledgeCandidate(client,author,draft.id,{
            idempotencyKey: "submit-1",expectedRevision: 1,expectedDigest: draft.digest })).state)
            .toBe("submitted");
          const decision = { idempotencyKey: "publish-1",expectedRevision: 1,
            expectedDigest: draft.digest,action: "publish",rightsAttested: true,
            sanitizationRationale: "Only generic build timing guidance remains",checklist };
          await expect(decideKnowledgeCandidate(client,author,draft.id,decision))
            .rejects.toMatchObject({ status: 403 });
          await client.query("UPDATE memberships SET role='member' WHERE id=$1",[adminMember]);
          await expect(decideKnowledgeCandidate(client,admin,draft.id,decision))
            .rejects.toMatchObject({ status: 401 });
          await client.query("UPDATE memberships SET role='admin' WHERE id=$1",[adminMember]);
          await client.query("UPDATE profile_records SET current_accepted_revision_id=NULL WHERE id=$1",
            [record]);
          await expect(decideKnowledgeCandidate(client,admin,draft.id,decision))
            .rejects.toMatchObject({ status: 404 });
          await client.query("UPDATE profile_records SET current_accepted_revision_id=$2 WHERE id=$1",
            [record,revision]);
          const published = await decideKnowledgeCandidate(client,admin,draft.id,decision);
          expect(published.action).toBe("publish");
          expect((await decideKnowledgeCandidate(client,admin,draft.id,decision)).replayed).toBe(true);
          const publication = await client.query<{ id: string }>(`
            SELECT id FROM knowledge_publications WHERE contribution_id=$1`,[draft.id]);
          const publicationId = publication.rows[0].id;
          const projection = await client.query<{ id: string; source_revision_id: string;
            source_generation: string; content_digest: string; projection_contract: string;
            passage_text: string; locators: unknown }>(`
            SELECT s.id,s.source_revision_id,s.source_generation,s.content_digest,
              s.projection_contract,p.passage_text,p.locators
            FROM retrieval_sources s JOIN retrieval_passages p ON p.source_id=s.id
            WHERE s.source_revision_id=$1 AND s.scope='shared' ORDER BY p.ordinal LIMIT 1`,
          [published.revisionId]);
          expect(projection.rows[0]?.passage_text).toBe(payload.title);
          expect(JSON.stringify(projection.rows[0])).not.toContain("Private Juniper Sentinel");
          expect(await recheckRetrievalSource(client,{
            id: projection.rows[0].id,kind: "published_shared",
            revisionId: projection.rows[0].source_revision_id,
            generation: Number(projection.rows[0].source_generation),audience: "shared",
            contentDigest: projection.rows[0].content_digest,
            projectionContract: projection.rows[0].projection_contract,
          },{ environmentId: environment,workspaceId: null,customerId: null,
            audience: "delivery",includeShared: true })).toBe(true);
          await client.query("SAVEPOINT shared_author_revocation");
          await client.query("UPDATE memberships SET active=false WHERE id=$1",[authorMember]);
          await expect(readPublishedKnowledge(client,reader,publicationId))
            .rejects.toMatchObject({ status: 404 });
          expect(await recheckRetrievalSource(client,{
            id: projection.rows[0].id,kind: "published_shared",
            revisionId: projection.rows[0].source_revision_id,
            generation: Number(projection.rows[0].source_generation),audience: "shared",
            contentDigest: projection.rows[0].content_digest,
            projectionContract: projection.rows[0].projection_contract,
          },{ environmentId: environment,workspaceId: null,customerId: null,
            audience: "delivery",includeShared: true })).toBe(false);
          await client.query("ROLLBACK TO SAVEPOINT shared_author_revocation");
          await client.query("RELEASE SAVEPOINT shared_author_revocation");
          const indexJob = await client.query<{ id: string; contract_digest: string }>(`
            SELECT id,contract_digest FROM retrieval_jobs
            WHERE source_id=$1 AND kind='index'`,[projection.rows[0].id]);
          const leaseToken = randomUUID();
          await client.query(`UPDATE retrieval_jobs SET state='leased',attempts=1,
            lease_token=$2,lease_started_at=now(),lease_until=now()+interval '30 seconds'
            WHERE id=$1`,[indexJob.rows[0].id,leaseToken]);
          const indexClaim = { id: indexJob.rows[0].id,sourceId: projection.rows[0].id,
            generation: Number(projection.rows[0].source_generation),
            contractDigest: indexJob.rows[0].contract_digest,kind: "index" as const,
            leaseToken,attempt: 1 };
          expect((await currentIndexPassages(indexClaim,client))?.some((item) =>
            item.passage_text === payload.title)).toBe(true);
          const internalDto = await readPublishedKnowledge(client,admin,publicationId);
          const otherDto = await readPublishedKnowledge(client,reader,publicationId);
          expect(otherDto).toEqual(internalDto);
          expect(await readPublishedKnowledge(client,partner,publicationId)).toEqual(internalDto);
          expect(JSON.stringify(otherDto)).not.toMatch(/Private Juniper Sentinel|customerId|lineage|sourceRevisionId/);
          await client.query("SAVEPOINT typed_conflict");
          await materializeCurrentProjection(client,"accepted_profile",revision,"internal");
          const flagged = await flagTypedConflict(client,admin,{
            idempotencyKey: "typed-flag",scope: "customer",customerId: customer,
            first: { kind: "accepted_profile",revisionId: revision },
            second: { kind: "published_shared",
              revisionId: projection.rows[0].source_revision_id },
            periodStart: "2026-01-01",periodEnd: "2026-09-28",
            rationale: "Synthetic source disagreement" });
          expect(flagged.state).toBe("flagged");
          expect((await decideTypedConflict(client,admin,flagged.id,{
            idempotencyKey: "typed-confirm",expectedVersion: 1,action: "confirm",
            rationale: "Both supported assertions conflict" })).state).toBe("confirmed");
          expect((await readPublishedKnowledge(client,reader,publicationId)).caveats)
            .toContain("Confirmed material conflict; do not use as settled guidance");
          await client.query("UPDATE profile_records SET current_accepted_revision_id=NULL WHERE id=$1",
            [record]);
          expect((await decideTypedConflict(client,admin,flagged.id,{
            idempotencyKey: "typed-resolve",expectedVersion: 2,action: "resolve",
            rationale: "Original source withdrawn" })).state).toBe("resolved");
          await client.query("ROLLBACK TO SAVEPOINT typed_conflict");
          await client.query("RELEASE SAVEPOINT typed_conflict");
          await client.query("UPDATE memberships SET active=false WHERE id=$1",[partnerMember]);
          await expect(readPublishedKnowledge(client,partner,publicationId))
            .rejects.toMatchObject({ status: 401 });
          await client.query("UPDATE memberships SET active=true WHERE id=$1",[partnerMember]);
          await client.query("SAVEPOINT shared_lineage_fanout");
          const secondDraft = await createKnowledgeCandidate(client,author,{
            idempotencyKey: "draft-fanout",customerId: customer,
            payload: { ...payload,solution: "Compare cache behavior across build stages" },lineage });
          await submitKnowledgeCandidate(client,author,secondDraft.id,{
            idempotencyKey: "submit-fanout",expectedRevision: 1,
            expectedDigest: secondDraft.digest });
          await decideKnowledgeCandidate(client,admin,secondDraft.id,{
            idempotencyKey: "publish-fanout",expectedRevision: 1,
            expectedDigest: secondDraft.digest,action: "publish",rightsAttested: true,
            sanitizationRationale: "Only generic build guidance remains",checklist });
          const secondPublication = await client.query<{ id: string }>(`
            SELECT id FROM knowledge_publications WHERE contribution_id=$1`,[secondDraft.id]);
          await client.query("UPDATE profile_records SET current_accepted_revision_id=NULL WHERE id=$1",
            [record]);
          expect(await currentIndexPassages(indexClaim,client)).toBeNull();
          await expect(readPublishedKnowledge(client,reader,publicationId))
            .rejects.toMatchObject({ status: 404 });
          expect(await recheckRetrievalSource(client,{
            id: projection.rows[0].id,kind: "published_shared",
            revisionId: projection.rows[0].source_revision_id,
            generation: Number(projection.rows[0].source_generation),audience: "shared",
            contentDigest: projection.rows[0].content_digest,
            projectionContract: projection.rows[0].projection_contract,
          },{ environmentId: environment,workspaceId: null,customerId: null,
            audience: "delivery",includeShared: true })).toBe(false);
          await client.query("SAVEPOINT knowledge_suspension");
          expect(await suspendStaleKnowledge(client)).toBe(2);
          const suspended = await client.query<{ state: string }>(`
            SELECT state FROM knowledge_publications WHERE id=ANY($1::uuid[])
            ORDER BY id`,[[publicationId,secondPublication.rows[0].id]]);
          expect(suspended.rows.map((row) => row.state)).toEqual(["suspended","suspended"]);
          expect((await readKnowledgeImpact(client,admin)).publications.suspended)
            .toBeGreaterThanOrEqual(2);
          await expect(readKnowledgeImpact(client,partner))
            .rejects.toMatchObject({ status: 403 });
          await client.query("ROLLBACK TO SAVEPOINT knowledge_suspension");
          await client.query("RELEASE SAVEPOINT knowledge_suspension");
          await client.query("ROLLBACK TO SAVEPOINT shared_lineage_fanout");
          await client.query("RELEASE SAVEPOINT shared_lineage_fanout");
          await client.query("UPDATE profile_records SET current_accepted_revision_id=$2 WHERE id=$1",
            [record,revision]);
          await withdrawKnowledge(client,admin,publicationId,{ idempotencyKey: "withdraw-1",
            expectedRevision: 1,expectedDigest: draft.digest,expectedPublicationGeneration: 1,
            rationale: "Synthetic withdrawal" });
          await expect(readPublishedKnowledge(client,reader,publicationId))
            .rejects.toMatchObject({ status: 404 });
          const retired = await client.query<{ lifecycle_state: string }>(`
            SELECT lifecycle_state FROM retrieval_sources WHERE id=$1`,[projection.rows[0].id]);
          expect(retired.rows[0]?.lifecycle_state).toBe("retired");
          const cleanup = await client.query<{ state: string }>(`
            SELECT state FROM retrieval_jobs WHERE source_id=$1 AND kind='cleanup'`,
          [projection.rows[0].id]);
          expect(cleanup.rows[0]?.state).toBe("queued");
          const corrected = await reviseKnowledgeCandidate(client,author,draft.id,{
            idempotencyKey: "revision-2",expectedRevision: 1,expectedDigest: draft.digest,
            payload: { ...payload,solution: "Compare build stage timings" },lineage });
          expect(corrected.revision).toBe(2);
          await submitKnowledgeCandidate(client,author,draft.id,{ idempotencyKey: "submit-2",
            expectedRevision: 2,expectedDigest: corrected.digest });
          await decideKnowledgeCandidate(client,admin,draft.id,{
            idempotencyKey: "publish-2",expectedRevision: 2,expectedDigest: corrected.digest,
            expectedPublicationGeneration: 2,action: "publish",rightsAttested: true,
            sanitizationRationale: "Corrected and rechecked",checklist });
          expect((await readPublishedKnowledge(client,partner,publicationId)).revision).toBe(2);
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { vi.unstubAllEnvs(); }
  });
});
