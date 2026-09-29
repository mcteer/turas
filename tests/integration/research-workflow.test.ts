import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CurrentSession } from "../../lib/server/auth/sessions";
import { withTestDatabase } from "../fixtures/database";
import { createResearchPreview, readResearchPreview, reviseResearchPreview,
  startResearch, readResearchRun, cancelResearchRun } from
  "../../lib/server/research/requests";
import { consumeResearchRun, reserveResearchOperation,
  dispatchResearchOperation,finishResearchRun,hasSubmittedContentOrigin } from
  "../../lib/server/research/execution";
import { assertResearchAttemptCurrent } from "../../lib/server/research/fences";
import { ingestCheckedObservation } from "../../lib/server/research/ingest";
import { normalizePublicDocument, exactPublicPassage } from "../../lib/server/research/normalize";
import { runRetrievalCleanupTick } from "../../lib/server/retrieval/cleanup";
import { listDueResearch,markDueResearch,recordResearchRefresh } from "../../lib/server/research/refresh";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

describe("owned bounded research admission", () => {
  it("keeps preview inert and admits one exact owned turn with replay and cancellation", async () => {
    const environment = process.env.TURAS_TEST_ENVIRONMENT_ID!;
    for (const [key,value] of Object.entries({
      DATABASE_URL: "postgres://localhost/turas_unused",
      DATABASE_URL_UNPOOLED: "postgres://localhost/turas_unused",
      TURAS_ENVIRONMENT_ID: environment,TURAS_APP_ORIGIN: "http://127.0.0.1:3000",
      TURAS_DEMO_USERNAME: "mcteer",TURAS_DEMO_PASSWORD: "synthetic",
      PANEL_USERNAME: "panel",PANEL_PASSWORD: "synthetic",
      PARTNER_USERNAME: "partner",PARTNER_PASSWORD: "synthetic",
      TURAS_MAINTENANCE_SECRET: "s".repeat(32),CONTEXT_API_KEY: "synthetic-test-key",
    })) vi.stubEnv(key,value);
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const workspace = randomUUID();
          const customer = randomUUID();
          const principal = randomUUID();
          const membership = randomUUID();
          const sessionId = randomUUID();
          const conversation = randomUUID();
          const nativeId = `wrun_${randomUUID().replaceAll("-","")}`;
          await client.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic research')",[workspace]);
          await client.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Researcher')",
            [principal,`research-${principal}`]);
          await client.query(`INSERT INTO memberships(id,principal_id,workspace_id,kind,role)
            VALUES($1,$2,$3,'internal','member')`,[membership,principal,workspace]);
          await client.query(`INSERT INTO login_sessions(id,principal_id,token_hash,expires_at)
            VALUES($1,$2,$3,now()+interval '1 hour')`,[sessionId,principal,sha(sessionId)]);
          await client.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
            VALUES($1,$2,'Synthetic public identity',true)`,[customer,workspace]);
          await client.query(`INSERT INTO conversations
            (id,environment_id,workspace_id,customer_id,owner_principal_id,
             eve_session_id,creation_operation_id,binding_state,title,
             context_snapshot_schema,context_login_session_id,context_membership_id,
             context_audience,context_generation,context_valid_until)
            VALUES($1,$2,$3,$4,$5,$6,$7,'bound','Synthetic research',
              'customer-context-v1',$8,$9,'internal',0,now()+interval '1 hour')`,
          [conversation,environment,workspace,customer,principal,nativeId,
            randomUUID(),sessionId,membership]);
          await client.query(`INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at)
            VALUES($1,'synthetic-worker',now())`,[environment]);
          const actor: CurrentSession = { sessionId,principalId: principal,membershipId: membership,
            workspaceId: workspace,kind: "internal",role: "member",token: "synthetic",
            loginName: "synthetic",displayName: "Researcher",
            expiresAt: new Date(Date.now()+3_600_000) };
          await client.query("SAVEPOINT local_fit_mode");
          const fitReceipt = randomUUID();
          await client.query(`INSERT INTO retrieval_receipts
            (id,environment_id,actor_membership_id,scope,workspace_id,
             customer_id,mode,citation_ids,as_of,valid_until)
            VALUES($1,$2,$3,'customer',$4,$5,'lexical_degraded',
              '[]'::jsonb,now(),now()+interval '1 hour')`,
          [fitReceipt,environment,membership,workspace,customer]);
          const fitPreview = await createResearchPreview(client,actor,{
            idempotencyKey: "fit-preview",customerId: customer,
            conversationId: conversation,mode: "fit",submittedUrls: [],
            evidenceReceiptIds: [fitReceipt] });
          expect(fitPreview.queries).toEqual([]);
          const fitStart = await startResearch(client,actor,fitPreview.id,{
            idempotencyKey: "fit-start",expectedRevision: fitPreview.revision,
            expectedDigest: fitPreview.digest });
          expect((await consumeResearchRun(client,actor,fitStart.attemptId)).mode).toBe("fit");
          await finishResearchRun(client,actor,fitStart.runId,0);
          expect((await client.query(`SELECT 1 FROM research_operations
            WHERE run_id=$1`,[fitStart.runId])).rowCount).toBe(0);
          await client.query("ROLLBACK TO SAVEPOINT local_fit_mode");
          await client.query("RELEASE SAVEPOINT local_fit_mode");
          const input = { idempotencyKey: "preview-1",customerId: customer,
            conversationId: conversation,submittedUrls: [],mode: "practices",
            product: "Vercel",version: "2026",topic: "build cache" };
          const created = await createResearchPreview(client,actor,input);
          expect(created.state).toBe("draft");
          expect(created.queries[0]).toContain("official documentation");
          expect(await createResearchPreview(client,actor,input)).toEqual(created);
          expect((await client.query("SELECT 1 FROM research_runs")).rowCount).toBe(0);
          await expect(reviseResearchPreview(client,actor,created.id,{
            idempotencyKey: "revision-2",expectedRevision: 1,
            expectedDigest: "a".repeat(64),input: { ...input,idempotencyKey: "preview-2" } }))
            .rejects.toMatchObject({ status: 409 });
          const changed = await reviseResearchPreview(client,actor,created.id,{
            idempotencyKey: "revision-2",expectedRevision: 1,expectedDigest: created.digest,
            input: { ...input,idempotencyKey: "preview-2",topic: "output tracing" } });
          expect(changed.revision).toBe(2);
          expect((await readResearchPreview(client,actor,created.id)).digest).toBe(changed.digest);
          await expect(startResearch(client,actor,created.id,{
            idempotencyKey: "start-1",expectedRevision: 1,expectedDigest: created.digest }))
            .rejects.toMatchObject({ status: 409 });
          const start = { idempotencyKey: "start-1",expectedRevision: 2,
            expectedDigest: changed.digest };
          const admitted = await startResearch(client,actor,created.id,start);
          expect(admitted.replayed).toBe(false);
          expect((await startResearch(client,actor,created.id,start)).replayed).toBe(true);
          await expect(startResearch(client,actor,created.id,{ ...start,
            idempotencyKey: "start-2" })).rejects.toMatchObject({ status: 409 });
          const run = await readResearchRun(client,actor,admitted.runId);
          expect(run.state).toBe("queued");
          expect(run.searchesUsed).toBe(0);
          await expect(consumeResearchRun(client,{ ...actor,sessionId: randomUUID() },
            admitted.attemptId)).rejects.toMatchObject({ status: 404 });
          await client.query("SAVEPOINT research_owner_revoked");
          await client.query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1",
            [sessionId]);
          await expect(consumeResearchRun(client,actor,admitted.attemptId))
            .rejects.toMatchObject({ status: 401 });
          await client.query("ROLLBACK TO SAVEPOINT research_owner_revoked");
          await client.query("RELEASE SAVEPOINT research_owner_revoked");
          await client.query("SAVEPOINT research_membership_revoked");
          await client.query("UPDATE memberships SET active=false WHERE id=$1",[membership]);
          await expect(consumeResearchRun(client,actor,admitted.attemptId))
            .rejects.toMatchObject({ status: 401 });
          await client.query("ROLLBACK TO SAVEPOINT research_membership_revoked");
          await client.query("RELEASE SAVEPOINT research_membership_revoked");
          await client.query("SAVEPOINT research_admission_expired");
          await client.query(`UPDATE research_requests
            SET admission_deadline=now()-interval '1 second' WHERE id=$1`,[created.id]);
          await expect(consumeResearchRun(client,actor,admitted.attemptId))
            .rejects.toMatchObject({ code: "admission_expired" });
          await client.query("ROLLBACK TO SAVEPOINT research_admission_expired");
          await client.query("RELEASE SAVEPOINT research_admission_expired");
          await client.query("SAVEPOINT research_replay");
          const consumed = await consumeResearchRun(client,actor,admitted.attemptId);
          expect(consumed.queries[0]).toContain("output tracing");
          await expect(reserveResearchOperation(client,actor,admitted.runId,
            "search",0,"model-invented wider query"))
            .rejects.toMatchObject({ code: "research_budget" });
          await expect(reserveResearchOperation(client,actor,admitted.runId,
            "search",2,"unapproved extra query"))
            .rejects.toMatchObject({ code: "research_budget" });
          await expect(reserveResearchOperation(client,actor,admitted.runId,
            "fetch",0,"https://unapproved.example.org/"))
            .rejects.toMatchObject({ code: "research_scope_changed" });
          const operation = await reserveResearchOperation(client,actor,admitted.runId,
            "search",0,consumed.queries[0]);
          await dispatchResearchOperation(client,actor,admitted.runId,operation);
          expect((await reserveResearchOperation(client,actor,admitted.runId,
            "search",0,consumed.queries[0])).state).toBe("unconfirmed");
          expect((await readResearchRun(client,actor,admitted.runId)).state).toBe("unconfirmed");
          await client.query("ROLLBACK TO SAVEPOINT research_replay");
          await client.query("RELEASE SAVEPOINT research_replay");
          await client.query("SAVEPOINT research_ingest");
          const currentRun = await consumeResearchRun(client,actor,admitted.attemptId);
          const search = await reserveResearchOperation(client,actor,admitted.runId,
            "search",0,currentRun.queries[0]);
          await dispatchResearchOperation(client,actor,admitted.runId,search);
          const publicUrl = "https://vercel.com/docs/build-cache";
          await client.query(`INSERT INTO research_discovery_results
            (id,operation_id,run_id,ordinal,public_url,title)
            VALUES($1,$2,$3,1,$4,'Synthetic official build cache docs')`,
          [randomUUID(),search.id,admitted.runId,publicUrl]);
          await client.query("UPDATE research_operations SET state='succeeded',finished_at=now() WHERE id=$1",
            [search.id]);
          const fetch = await reserveResearchOperation(client,actor,admitted.runId,
            "fetch",0,publicUrl);
          await dispatchResearchOperation(client,actor,admitted.runId,fetch);
          const rawBody = Buffer.from("Vercel official output tracing supports build diagnostics.");
          const normalized = normalizePublicDocument(rawBody.toString(),"text/plain");
          const passage = exactPublicPassage(normalized.text,"Vercel output tracing");
          const observationId = randomUUID();
          await client.query(`INSERT INTO research_observations
            (id,run_id,operation_id,origin,requested_url,canonical_url,
             identity_checked,scope_checked,integrity_checked,content_checked,
             body_digest,passage_digest,passage_text,normalized_characters,
             retrieval_at,date_provenance,content_type,normalized_digest)
            VALUES($1,$2,$3,'independent_discovery',$4,$4,true,true,true,true,
              $5,$6,$7,$8,now(),'{}'::jsonb,'text/plain',$9)`,
          [observationId,admitted.runId,fetch.id,publicUrl,sha(rawBody.toString()),
            passage.digest,passage.text,normalized.text.length,normalized.digest]);
          await client.query(`INSERT INTO research_observation_payloads
            (observation_id,normalized_text,raw_body,raw_body_expires_at)
            VALUES($1,$2,$3,now()+interval '24 hours')`,
          [observationId,normalized.text,rawBody]);
          await client.query(`UPDATE research_operations SET state='succeeded',finished_at=now()
            WHERE id=$1`,[fetch.id]);
          await client.query("SAVEPOINT normalized_submission_origin");
          await client.query(`UPDATE research_observations SET origin='user_submission'
            WHERE id=$1`,[observationId]);
          await client.query(`DELETE FROM research_observation_payloads
            WHERE observation_id=$1`,[observationId]);
          const originIdentity = { environmentId: environment,workspaceId: workspace,
            customerId: customer };
          const mirroredContent = { bodyDigest: sha("different HTML wrapper"),
            passageDigest: sha("different selected quote"),
            normalizedDigest: normalized.digest,normalizedText: normalized.text };
          expect(await hasSubmittedContentOrigin(client,originIdentity,mirroredContent))
            .toBe(true);
          expect(await hasSubmittedContentOrigin(client,{
            ...originIdentity,customerId: randomUUID() },mirroredContent)).toBe(false);
          await client.query("ROLLBACK TO SAVEPOINT normalized_submission_origin");
          await client.query("RELEASE SAVEPOINT normalized_submission_origin");
          await client.query("SAVEPOINT research_cancel_before_ingest");
          await cancelResearchRun(client,actor,admitted.runId,
            { idempotencyKey: "cancel-before-ingest" });
          await expect(ingestCheckedObservation(client,actor,observationId))
            .rejects.toMatchObject({ code: "research_not_running" });
          expect((await client.query(`SELECT 1 FROM research_evidence_links
            WHERE observation_id=$1`,[observationId])).rowCount).toBe(0);
          await client.query("ROLLBACK TO SAVEPOINT research_cancel_before_ingest");
          await client.query("RELEASE SAVEPOINT research_cancel_before_ingest");
          await client.query("SAVEPOINT research_revoke_before_ingest");
          await client.query("UPDATE memberships SET active=false WHERE id=$1",[membership]);
          await expect(ingestCheckedObservation(client,actor,observationId))
            .rejects.toMatchObject({ status: 401 });
          await client.query("ROLLBACK TO SAVEPOINT research_revoke_before_ingest");
          await client.query("RELEASE SAVEPOINT research_revoke_before_ingest");
          await client.query("SAVEPOINT research_quote_without_topic");
          await client.query(`UPDATE research_observations
            SET passage_text='Vercel official',passage_digest=$2 WHERE id=$1`,
          [observationId,sha("Vercel official")]);
          await expect(ingestCheckedObservation(client,actor,observationId))
            .rejects.toMatchObject({ code: "research_source_unverified" });
          await client.query("ROLLBACK TO SAVEPOINT research_quote_without_topic");
          await client.query("RELEASE SAVEPOINT research_quote_without_topic");
          await client.query("SAVEPOINT research_normalized_tamper");
          await client.query(`UPDATE research_observations SET normalized_digest=$2
            WHERE id=$1`,[observationId,"a".repeat(64)]);
          await expect(ingestCheckedObservation(client,actor,observationId))
            .rejects.toMatchObject({ code: "research_source_unverified" });
          await client.query("ROLLBACK TO SAVEPOINT research_normalized_tamper");
          await client.query("RELEASE SAVEPOINT research_normalized_tamper");
          const ingested = await ingestCheckedObservation(client,actor,observationId);
          expect(ingested.attributed).toBe(true);
          const verified = await client.query<{ supported_claim: string;
            quality_input: { R: number; D: number } }>(`
            SELECT supported_claim,quality_input FROM evidence_source_revisions
            WHERE id=$1`,[ingested.sourceRevisionId]);
          expect(verified.rows[0]?.supported_claim).toBe(passage.text);
          expect(verified.rows[0]?.quality_input).toMatchObject({ R: 4,D: 4 });
          expect((await ingestCheckedObservation(client,actor,observationId)).sourceRevisionId)
            .toBe(ingested.sourceRevisionId);
          expect(await markDueResearch(client)).toBeGreaterThanOrEqual(1);
          const refreshable = await listDueResearch(client,actor,customer);
          expect(refreshable.find((item) => item.sourceRevisionId === ingested.sourceRevisionId))
            .toMatchObject({ mode: "practices",publicFields: {
              product: "Vercel",version: "2026",topic: "output tracing" } });
          const due = await client.query<{ state: string }>(`
            SELECT state FROM research_review_due WHERE source_revision_id=$1`,
          [ingested.sourceRevisionId]);
          expect(due.rows[0]?.state).toBe("current");
          await client.query(`UPDATE research_requests SET public_fields=public_fields || $2::jsonb
            WHERE id=$1`,[created.id,JSON.stringify({ submittedUrls: [publicUrl],
              refreshSourceRevisionId: ingested.sourceRevisionId })]);
          await client.query("SAVEPOINT research_changed_refresh");
          await client.query(`UPDATE research_observations
            SET retrieval_at=now()-interval '1 minute' WHERE id=$1`,[observationId]);
          const changedBody = Buffer.from(
            "Vercel official output tracing now includes cache diagnostics.");
          const changedText = normalizePublicDocument(changedBody.toString(),"text/plain");
          const changedPassage = exactPublicPassage(changedText.text,"Vercel output tracing");
          const changedObservationId = randomUUID();
          await client.query(`INSERT INTO research_observations
            (id,run_id,operation_id,origin,requested_url,canonical_url,
             identity_checked,scope_checked,integrity_checked,content_checked,
             body_digest,passage_digest,passage_text,normalized_characters,
             retrieval_at,date_provenance,content_type,normalized_digest)
            VALUES($1,$2,$3,'independent_discovery',$4,$4,true,true,true,true,
              $5,$6,$7,$8,now(),'{}'::jsonb,'text/plain',$9)`,
          [changedObservationId,admitted.runId,fetch.id,publicUrl,
            sha(changedBody.toString()),changedPassage.digest,changedPassage.text,
            changedText.text.length,changedText.digest]);
          await client.query(`INSERT INTO research_observation_payloads
            (observation_id,normalized_text,raw_body,raw_body_expires_at)
            VALUES($1,$2,$3,now()+interval '24 hours')`,
          [changedObservationId,changedText.text,changedBody]);
          const changedRevision = await ingestCheckedObservation(client,actor,changedObservationId);
          expect(changedRevision.sourceRevisionId).not.toBe(ingested.sourceRevisionId);
          const retiredProjection = await client.query<{ lifecycle_state: string;
            job_state: string }>(`SELECT source.lifecycle_state,job.state AS job_state
            FROM retrieval_sources source JOIN retrieval_jobs job ON job.source_id=source.id
              AND job.kind='cleanup'
            WHERE source.source_kind='verified_research'
              AND source.source_revision_id=$1`,[ingested.sourceRevisionId]);
          expect(retiredProjection.rows.length).toBeGreaterThan(0);
          expect(retiredProjection.rows.every((row) => row.lifecycle_state === "retired" &&
            row.job_state === "queued")).toBe(true);
          await client.query(`UPDATE retrieval_sources
            SET updated_at=now()-interval '61 seconds'
            WHERE source_kind='verified_research' AND source_revision_id=$1`,
          [ingested.sourceRevisionId]);
          await runRetrievalCleanupTick(client);
          const purged = await client.query(`SELECT 1 FROM retrieval_passages passage
            JOIN retrieval_sources source ON source.id=passage.source_id
            WHERE source.source_kind='verified_research'
              AND source.source_revision_id=$1`,[ingested.sourceRevisionId]);
          expect(purged.rowCount).toBe(0);
          await client.query(`UPDATE research_runs SET state='completed',finished_at=now()
            WHERE id=$1`,[admitted.runId]);
          expect((await recordResearchRefresh(client,actor,customer,{
            idempotencyKey: "refresh-changed",requestId: created.id,
            sourceRevisionId: ingested.sourceRevisionId,
            expectedPassageDigest: passage.digest })).outcome).toBe("changed");
          await client.query("ROLLBACK TO SAVEPOINT research_changed_refresh");
          await client.query("RELEASE SAVEPOINT research_changed_refresh");
          await client.query(`UPDATE research_runs SET state='completed',finished_at=now()
            WHERE id=$1`,[admitted.runId]);
          await expect(cancelResearchRun(client,actor,admitted.runId,
            { idempotencyKey: "late-cancel" }))
            .rejects.toMatchObject({ code: "research_not_running" });
          expect((await readResearchRun(client,actor,admitted.runId)).state).toBe("completed");
          const refreshCommand = { idempotencyKey: "refresh-1",requestId: created.id,
            sourceRevisionId: ingested.sourceRevisionId,expectedPassageDigest: passage.digest };
          await client.query("SAVEPOINT copied_refresh");
          await client.query(`UPDATE research_observations SET origin='user_submission',
            identity_checked=false,scope_checked=false,integrity_checked=false,
            content_checked=false WHERE id=$1`,[observationId]);
          expect((await recordResearchRefresh(client,actor,customer,{
            ...refreshCommand,idempotencyKey: "refresh-copied" })).outcome).toBe("failed");
          await client.query("ROLLBACK TO SAVEPOINT copied_refresh");
          await client.query("RELEASE SAVEPOINT copied_refresh");
          expect((await recordResearchRefresh(client,actor,customer,refreshCommand)).outcome)
            .toBe("unchanged");
          expect((await recordResearchRefresh(client,actor,customer,refreshCommand)).replayed)
            .toBe(true);
          await client.query("SAVEPOINT research_retired_refresh");
          await client.query(`INSERT INTO evidence_source_events
            (id,source_revision_id,lifecycle_version,event_type,rationale)
            VALUES($1,$2,1,'withdraw','Synthetic retirement')`,
          [randomUUID(),ingested.sourceRevisionId]);
          await expect(recordResearchRefresh(client,actor,customer,{
            ...refreshCommand,idempotencyKey: "refresh-retired" }))
            .rejects.toMatchObject({ code: "refresh_source_retired" });
          await expect(ingestCheckedObservation(client,actor,observationId))
            .rejects.toMatchObject({ code: "research_source_retired" });
          await client.query(`UPDATE research_runs SET state='running',finished_at=NULL
            WHERE id=$1`,[admitted.runId]);
          const recheckOperationId = randomUUID();
          await client.query(`INSERT INTO research_operations
            (id,run_id,step_key,operation_key,kind,state,deadline,
             dispatched_at,finished_at)
            VALUES($1,$2,'fetch:withdrawn-recheck','withdrawn-recheck','fetch',
              'succeeded',now()+interval '1 minute',now(),now())`,
          [recheckOperationId,admitted.runId]);
          const recheckObservationId = randomUUID();
          await client.query(`INSERT INTO research_observations
            (id,run_id,operation_id,origin,requested_url,canonical_url,
             identity_checked,scope_checked,integrity_checked,content_checked,
             body_digest,passage_digest,passage_text,normalized_characters,
             retrieval_at,date_provenance,content_type,normalized_digest)
            VALUES($1,$2,$3,'independent_discovery',$4,$4,true,true,true,true,
              $5,$6,$7,$8,now(),'{}'::jsonb,'text/plain',$9)`,
          [recheckObservationId,admitted.runId,recheckOperationId,publicUrl,
            sha(rawBody.toString()),passage.digest,passage.text,normalized.text.length,
            normalized.digest]);
          await client.query(`INSERT INTO research_observation_payloads
            (observation_id,normalized_text,raw_body,raw_body_expires_at)
            VALUES($1,$2,$3,now()+interval '24 hours')`,
          [recheckObservationId,normalized.text,rawBody]);
          expect((await ingestCheckedObservation(client,actor,recheckObservationId))
            .sourceRevisionId).not.toBe(ingested.sourceRevisionId);
          await runRetrievalCleanupTick(client);
          expect((await client.query(`SELECT 1 FROM research_observation_payloads
            WHERE observation_id=$1`,[observationId])).rowCount).toBe(0);
          await client.query("ROLLBACK TO SAVEPOINT research_retired_refresh");
          await client.query("RELEASE SAVEPOINT research_retired_refresh");
          await expect(recordResearchRefresh(client,actor,customer,{
            ...refreshCommand,expectedPassageDigest: "a".repeat(64) }))
            .rejects.toMatchObject({ code: "idempotency_conflict" });
          await client.query(`UPDATE research_observation_payloads
            SET raw_body_expires_at=now()-interval '1 second' WHERE observation_id=$1`,
          [observationId]);
          await runRetrievalCleanupTick(client);
          expect((await client.query(`SELECT 1 FROM research_observation_payloads
            WHERE observation_id=$1`,[observationId])).rowCount).toBe(0);
          await client.query("ROLLBACK TO SAVEPOINT research_ingest");
          await client.query("RELEASE SAVEPOINT research_ingest");
          await client.query("SAVEPOINT research_expiry");
          await client.query(`UPDATE research_requests
            SET admission_deadline=now()-interval '1 second' WHERE id=$1`,[created.id]);
          await runRetrievalCleanupTick(client);
          expect((await readResearchRun(client,actor,admitted.runId)).state).toBe("failed");
          await client.query("ROLLBACK TO SAVEPOINT research_expiry");
          await client.query("RELEASE SAVEPOINT research_expiry");
          await client.query("SAVEPOINT research_ambiguous_deadline");
          const deadlineRun = await consumeResearchRun(client,actor,admitted.attemptId);
          const deadlineSearch = await reserveResearchOperation(client,actor,
            admitted.runId,"search",0,deadlineRun.queries[0]);
          await dispatchResearchOperation(client,actor,admitted.runId,deadlineSearch);
          await client.query(`UPDATE research_runs SET run_deadline=now()-interval '1 second'
            WHERE id=$1`,[admitted.runId]);
          await client.query(`UPDATE research_operations SET deadline=now()-interval '1 second'
            WHERE id=$1`,[deadlineSearch.id]);
          await runRetrievalCleanupTick(client);
          expect((await readResearchRun(client,actor,admitted.runId)).state)
            .toBe("unconfirmed");
          await client.query("ROLLBACK TO SAVEPOINT research_ambiguous_deadline");
          await client.query("RELEASE SAVEPOINT research_ambiguous_deadline");
          expect((await cancelResearchRun(client,actor,admitted.runId,
            { idempotencyKey: "cancel-1" })).state).toBe("cancelled");
          expect((await cancelResearchRun(client,actor,admitted.runId,
            { idempotencyKey: "cancel-1" })).replayed).toBe(true);
          expect((await readResearchRun(client,actor,admitted.runId)).state).toBe("cancelled");
          const laterSessionId = randomUUID();
          await client.query(`INSERT INTO login_sessions(id,principal_id,token_hash,expires_at)
            VALUES($1,$2,$3,now()+interval '1 hour')`,
          [laterSessionId,principal,sha(laterSessionId)]);
          expect((await readResearchRun(client,{ ...actor,sessionId: laterSessionId },
            admitted.runId)).state).toBe("cancelled");
          const cancelledAttempt = await client.query<{ dispatch_state: string;
            response_state: string }>(`SELECT dispatch_state,response_state
            FROM response_attempts WHERE id=$1`,[admitted.attemptId]);
          expect(cancelledAttempt.rows[0]).toMatchObject({ dispatch_state: "rejected",
            response_state: "cancelled" });
          await expect(assertResearchAttemptCurrent(client,admitted.attemptId))
            .rejects.toMatchObject({ code: "research_context_changed" });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { vi.unstubAllEnvs(); }
  });
});
