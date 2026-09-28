import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { DEMO_IDS } from "../fixtures/identities";
import type { CurrentSession } from "../../lib/server/auth/sessions";
import { createProfileTestSession as session } from "../fixtures/profiles";
import { submitProfileCommand, submitProfileCommandDetailed } from "../../lib/server/profiles/service";
import { readProfile, listProfileRecords, readProfileHistory, readProfileRecord, listReviewQueue } from "../../lib/server/profiles/read";

const customerId = DEMO_IDS.sharedCustomer;
const productKey = "test-" + randomUUID().slice(0, 8);

function product() {
  return { kind: "product_use", productKey, displayName: "Synthetic product", state: "actual",
    usageDescription: "Synthetic delivery", observedAt: "2026-09-01T00:00:00Z" };
}

// Each scenario rolls back the inserted sessions, records and decisions together.
describe("profile review state", () => {
  it("keeps proposals pending until exact acceptance, then rejects stale review and replay after lost authority", async () => {
    const oldMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          await client.query("INSERT INTO customer_profile_state(customer_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [customerId, DEMO_IDS.workspace]);
          const contributor = await session(client, "panel");
          const admin = await session(client, "mcteer");
          const submit = { requestKey: randomUUID(), action: "propose_record", payload: product(),
            requestedAudience: "delivery", dataCategory: "delivery_context" };
          const proposal = await submitProfileCommand(contributor, customerId, submit, client) as { recordId: string; revisionId: string };
          const audit = await client.query<{ action: string; target_id: string;
            transition: string; record_version: string | null; duration_ms: number }>(
            "SELECT action,target_id,transition,record_version,duration_ms FROM profile_audit_events WHERE target_id=$1",
            [proposal.revisionId]);
          expect(audit.rows).toContainEqual(expect.objectContaining({ action: "propose_record",
            target_id: proposal.revisionId, transition: "pending", record_version: null,
            duration_ms: expect.any(Number) }));
          const pending = await client.query<{ current_accepted_revision_id: string | null; version: string }>(
            "SELECT current_accepted_revision_id,version FROM profile_records WHERE id=$1", [proposal.recordId]);
          expect(pending.rows[0]).toMatchObject({ current_accepted_revision_id: null, version: "0" });
          const second = await submitProfileCommand(contributor, customerId,
            { ...submit, requestKey: randomUUID() }, client) as { recordId: string; revisionId: string };
          expect(second.recordId).toBe(proposal.recordId);
          expect(second.revisionId).not.toBe(proposal.revisionId);
          const digest = await client.query<{ content_digest: string }>(
            "SELECT content_digest FROM profile_revisions WHERE id=$1", [proposal.revisionId]);
          const queue = await listReviewQueue(admin, customerId, {}, client) as { pending: {
            id: string; contentDigest: string; recordVersion: number; currentAcceptedRevisionId: string | null;
            requestedAudience: string; acceptedPayload: unknown; authorKind: string;
          }[] };
          expect(queue.pending.find((item) => item.id === proposal.revisionId)).toMatchObject({
            contentDigest: digest.rows[0].content_digest, recordVersion: 0,
            currentAcceptedRevisionId: null, requestedAudience: "delivery",
            acceptedPayload: null, authorKind: "internal",
          });
          const approve = { requestKey: randomUUID(), action: "accept_revision", revisionId: proposal.revisionId,
            digest: digest.rows[0].content_digest, expectedRecordVersion: 0, expectedAcceptedRevisionId: null,
            rationale: "Synthetic evidence reviewed" };
          const accepted = await submitProfileCommand(admin, customerId, approve, client);
          expect(accepted).toMatchObject({ reviewState: "accepted", recordVersion: 1 });
          const acceptedAudit = await client.query<{ action: string; record_version: string;
            duration_ms: number }>("SELECT action,record_version,duration_ms FROM profile_audit_events WHERE target_id=$1 AND action='accept_revision'",
          [proposal.revisionId]);
          expect(acceptedAudit.rows).toEqual([expect.objectContaining({
            action: "accept_revision", record_version: "1", duration_ms: expect.any(Number),
          })]);
          const historicalQuality = await client.query<{ input: {
            proposalRevisionId: string; proposerMembershipId: string;
            confirmedByMembershipId: string }; score: number; freshness: number }>(
            "SELECT input,score,freshness FROM evidence_quality_snapshots WHERE profile_revision_id=$1",
            [proposal.revisionId]);
          expect(historicalQuality.rows).toHaveLength(1);
          expect(historicalQuality.rows[0].input).toMatchObject({
            proposalRevisionId: proposal.revisionId,
            proposerMembershipId: contributor.membershipId,
            confirmedByMembershipId: admin.membershipId,
          });
          await expect(submitProfileCommand(admin, customerId,
            { ...approve, requestKey: randomUUID(), revisionId: second.revisionId }, client))
            .rejects.toMatchObject({ status: 409 });
          const partner = await session(client, "partner");
          const partnerProfile = await readProfile(partner, customerId, client) as {
            acceptedFacts: { id: string }[];
          };
          expect(partnerProfile.acceptedFacts.map((fact) => fact.id)).toContain(proposal.revisionId);
          const partnerList = await listProfileRecords(partner, customerId, {}, client);
          expect(partnerList.items.map((item) => item.id)).toContain(proposal.revisionId);
          expect(partnerList.items.map((item) => item.id)).not.toContain(second.revisionId);
          const malformedCursor = Buffer.from(JSON.stringify({ actor: partner.membershipId,
            customer: customerId, filter: "{}", at: "not-a-date", id: randomUUID() }))
            .toString("base64url");
          await expect(listProfileRecords(partner, customerId,
            { cursor: malformedCursor }, client)).rejects.toMatchObject({ status: 422 });
          const ownPending = await submitProfileCommand(partner, customerId,
            { requestKey: randomUUID(), action: "propose_record",
              payload: { kind: "claim", text: "Synthetic partner observation", sourceType: "manual" },
              requestedAudience: "delivery", dataCategory: "delivery_context" }, client) as { revisionId: string };
          const partnerHistory = await readProfileHistory(partner, customerId, proposal.recordId, {}, client);
          expect(partnerHistory.items.map((item) => item.id)).toEqual([proposal.revisionId]);
          expect(partnerHistory.events).toEqual([]);
          const internalHistory = await readProfileHistory(admin, customerId, proposal.recordId, {}, client);
          expect(internalHistory.events).toContainEqual(expect.objectContaining({
            eventType: "accept", revisionId: proposal.revisionId,
            actorMembershipId: admin.membershipId,
          }));
          const partnerWithOwn = await listProfileRecords(partner, customerId, {}, client);
          expect(partnerWithOwn.items.map((item) => item.id)).toContain(ownPending.revisionId);
          expect(partnerWithOwn.items.map((item) => item.id)).not.toContain(second.revisionId);
          const internalProposal = await submitProfileCommand(contributor, customerId,
            { requestKey: randomUUID(), action: "propose_record",
              payload: { kind: "claim", text: "INTERNAL_OPERATIONS_SENTINEL_DO_NOT_PROJECT", sourceType: "manual" },
              requestedAudience: "internal", dataCategory: "internal_operations" }, client) as { recordId: string; revisionId: string };
          const internalDigest = await client.query<{ content_digest: string }>(
            "SELECT content_digest FROM profile_revisions WHERE id=$1", [internalProposal.revisionId]);
          await submitProfileCommand(admin, customerId,
            { requestKey: randomUUID(), action: "accept_revision", revisionId: internalProposal.revisionId,
              digest: internalDigest.rows[0].content_digest, expectedRecordVersion: 0,
              expectedAcceptedRevisionId: null, rationale: "Synthetic internal note reviewed" }, client);
          const safe = await readProfile(partner, customerId, client);
          expect(JSON.stringify(safe)).not.toContain("INTERNAL_OPERATIONS_SENTINEL_DO_NOT_PROJECT");
          await expect(readProfileRecord(partner, customerId, internalProposal.recordId, client))
            .rejects.toMatchObject({ status: 404 });
          const replay = await submitProfileCommand(admin, customerId, approve, client);
          expect(replay).toEqual(accepted);
          await expect(submitProfileCommand(admin, customerId,
            { ...approve, rationale: "Different body" }, client)).rejects.toMatchObject({ status: 409 });
          const correction = await submitProfileCommand(contributor, customerId,
            { requestKey: randomUUID(), action: "propose_revision", recordId: proposal.recordId,
              expectedRecordVersion: 1, expectedAcceptedRevisionId: proposal.revisionId,
              workloadId: null, payload: { ...product(), state: "planned" },
              requestedAudience: "delivery", dataCategory: "delivery_context" }, client);
          expect(correction).toMatchObject({ reviewState: "pending" });
          const correctionQueue = await listReviewQueue(admin, customerId, {}, client) as {
            pending: { id: string; scopeLabel: string; recentHistory: { decision: string }[] }[] };
          expect(correctionQueue.pending.find((item) => item.id ===
            (correction as { revisionId: string }).revisionId)).toMatchObject({
            scopeLabel: "Customer-wide", recentHistory: [{ decision: "accept" }],
          });
          const stillCurrent = await client.query<{ current_accepted_revision_id: string }>(
            "SELECT current_accepted_revision_id FROM profile_records WHERE id=$1", [proposal.recordId]);
          expect(stillCurrent.rows[0].current_accepted_revision_id).toBe(proposal.revisionId);
          const request = await submitProfileCommand(contributor, customerId,
            { requestKey: randomUUID(), action: "request_retraction", revisionId: proposal.revisionId,
              expectedRecordVersion: 1, reason: "Synthetic correction requested" }, client) as { requestId: string };
          expect(request).toMatchObject({ state: "open" });
          const retracted = await submitProfileCommand(admin, customerId,
            { requestKey: randomUUID(), action: "retract_revision", revisionId: proposal.revisionId,
              expectedRecordVersion: 1, requestId: request.requestId, rationale: "Synthetic fact withdrawn" }, client);
          expect(retracted).toMatchObject({ state: "retracted", recordVersion: 2 });
          const empty = await client.query<{ current_accepted_revision_id: string | null }>(
            "SELECT current_accepted_revision_id FROM profile_records WHERE id=$1", [proposal.recordId]);
          expect(empty.rows[0].current_accepted_revision_id).toBeNull();
          const decisions = await client.query("SELECT decision FROM profile_review_decisions WHERE revision_id=$1", [proposal.revisionId]);
          expect(decisions.rows).toHaveLength(1);
          await client.query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1", [admin.sessionId]);
          await expect(submitProfileCommand(admin, customerId, approve, client)).rejects.toMatchObject({ status: 401 });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = oldMarker; }
  });

  it("denies partner internal operational proposals before persistence", async () => {
    const oldMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          await client.query("INSERT INTO customer_profile_state(customer_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [customerId, DEMO_IDS.workspace]);
          const partner = await session(client, "partner");
          await expect(submitProfileCommand(partner, customerId, { requestKey: randomUUID(),
            action: "propose_record", payload: product(), requestedAudience: "internal",
            dataCategory: "internal_operations" }, client)).rejects.toMatchObject({ status: 403 });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = oldMarker; }
  });

  it("rejects cross-customer references and internal stakeholder delivery content", async () => {
    const oldMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const panel = await session(client, "panel");
          await expect(submitProfileCommand(panel, customerId, { requestKey: randomUUID(),
            action: "propose_record", requestedAudience: "delivery", dataCategory: "delivery_context",
            payload: { kind: "stakeholder", name: "Synthetic contact", role: "Owner",
              responsibilities: "Internal planning", classification: "internal" } }, client))
            .rejects.toMatchObject({ status: 422 });
          await expect(submitProfileCommand(panel, customerId, { requestKey: randomUUID(),
            action: "propose_record", requestedAudience: "internal", dataCategory: "other_internal",
            payload: { ...product(), ownerReferenceId: randomUUID() } }, client))
            .rejects.toMatchObject({ status: 404 });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = oldMarker; }
  });

  it("labels assistant proposals separately and never lets a client choose that channel", async () => {
    const oldMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const panel = await session(client, "panel");
          const admin = await session(client, "mcteer");
          const command = { requestKey: randomUUID(), action: "propose_record",
            payload: { kind: "claim", text: "Synthetic assistant assessment", sourceType: "manual" },
            requestedAudience: "internal", dataCategory: "other_internal" };
          await expect(submitProfileCommand(panel, customerId,
            { ...command, submissionChannel: "agent_proposal" }, client))
            .rejects.toMatchObject({ status: 422 });
          const result = await submitProfileCommandDetailed(panel, customerId, command,
            client, { submissionChannel: "agent_proposal" });
          expect(result.data).toMatchObject({ reviewState: "pending" });
          const revisionId = (result.data as { revisionId: string }).revisionId;
          const stored = await client.query<{ submission_channel: string }>(
            "SELECT submission_channel FROM profile_revisions WHERE id=$1", [revisionId]);
          expect(stored.rows[0].submission_channel).toBe("agent_proposal");
          const queue = await listReviewQueue(admin, customerId, {}, client) as {
            pending: { id: string; submissionChannel: string }[] };
          expect(queue.pending.find((item) => item.id === revisionId)?.submissionChannel)
            .toBe("agent_proposal");
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = oldMarker; }
  });

  it("versions retraction requests and resolves only the exact current accepted fact", async () => {
    const oldMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const panel = await session(client, "panel");
          const admin = await session(client, "mcteer");
          const partner = await session(client, "partner");
          const proposed = await submitProfileCommand(panel, customerId,
            { requestKey: randomUUID(), action: "propose_record",
              payload: { kind: "claim", text: "Synthetic retraction fact", sourceType: "manual" },
              requestedAudience: "delivery", dataCategory: "delivery_context" }, client) as {
            revisionId: string; recordId: string };
          const digest = await client.query<{ content_digest: string }>(
            "SELECT content_digest FROM profile_revisions WHERE id=$1", [proposed.revisionId]);
          await submitProfileCommand(admin, customerId, { requestKey: randomUUID(),
            action: "accept_revision", revisionId: proposed.revisionId,
            digest: digest.rows[0].content_digest, expectedRecordVersion: 0,
            expectedAcceptedRevisionId: null, rationale: "Synthetic review" }, client);
          const first = await submitProfileCommand(partner, customerId,
            { requestKey: randomUUID(), action: "request_retraction", revisionId: proposed.revisionId,
              expectedRecordVersion: 1, reason: "Synthetic correction needed" }, client) as {
            requestId: string; version: number };
          expect(first.version).toBe(1);
          await expect(submitProfileCommand(partner, customerId,
            { requestKey: randomUUID(), action: "request_retraction", revisionId: proposed.revisionId,
              expectedRecordVersion: 1, reason: "Duplicate" }, client)).rejects.toMatchObject({ status: 409 });
          await expect(submitProfileCommand(admin, customerId,
            { requestKey: randomUUID(), action: "decline_retraction", requestId: first.requestId,
              expectedVersion: 0, rationale: "Not yet", partnerSafeReason: "Please provide more detail" }, client))
            .rejects.toMatchObject({ status: 409 });
          await submitProfileCommand(admin, customerId,
            { requestKey: randomUUID(), action: "decline_retraction", requestId: first.requestId,
              expectedVersion: 1, rationale: "Not yet", partnerSafeReason: "Please provide more detail" }, client);
          const second = await submitProfileCommand(partner, customerId,
            { requestKey: randomUUID(), action: "request_retraction", revisionId: proposed.revisionId,
              expectedRecordVersion: 1, reason: "New supporting detail" }, client) as { requestId: string };
          await expect(submitProfileCommand(admin, customerId,
            { requestKey: randomUUID(), action: "retract_revision", revisionId: proposed.revisionId,
              expectedRecordVersion: 1, requestId: first.requestId, rationale: "Wrong request" }, client))
            .rejects.toMatchObject({ status: 409 });
          await submitProfileCommand(admin, customerId,
            { requestKey: randomUUID(), action: "retract_revision", revisionId: proposed.revisionId,
              expectedRecordVersion: 1, requestId: second.requestId,
              rationale: "Confirmed correction" }, client);
          const state = await client.query<{ state: string; version: string }>(
            "SELECT state,version FROM profile_retraction_requests WHERE id=$1", [second.requestId]);
          expect(state.rows[0]).toEqual({ state: "resolved", version: "2" });
          const head = await client.query<{ current_accepted_revision_id: string | null }>(
            "SELECT current_accepted_revision_id FROM profile_records WHERE id=$1", [proposed.recordId]);
          expect(head.rows[0].current_accepted_revision_id).toBeNull();
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = oldMarker; }
  });

  it("commits one of two competing exact review decisions", async () => {
    const oldMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      const key = "race-" + randomUUID().slice(0, 8);
      let reviewer: CurrentSession | undefined;
      let revisionId = "";
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const contributor = await session(client, "panel");
          reviewer = await session(client, "mcteer");
          const proposed = await submitProfileCommand(contributor, customerId,
            { requestKey: randomUUID(), action: "propose_record",
              payload: { ...product(), productKey: key }, requestedAudience: "delivery",
              dataCategory: "delivery_context" }, client) as { revisionId: string };
          revisionId = proposed.revisionId;
          await client.query("COMMIT");
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      });
      const digest = await withTestDatabase(async (client) => {
        const result = await client.query<{ content_digest: string }>(
          "SELECT content_digest FROM profile_revisions WHERE id=$1", [revisionId]);
        return result.rows[0].content_digest;
      });
      if (!reviewer) throw new Error("Reviewer fixture missing");
      const decide = async (action: "accept_revision" | "reject_revision") => withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const result = await submitProfileCommand(reviewer!, customerId,
            { requestKey: randomUUID(), action, revisionId,
              ...(action === "accept_revision" ? { digest, expectedAcceptedRevisionId: null } : {}),
              expectedRecordVersion: 0,
              rationale: "Race fixture reviewed" }, client);
          await client.query("COMMIT");
          return result;
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      });
      const results = await Promise.allSettled([decide("accept_revision"), decide("reject_revision")]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      const outcomes = await withTestDatabase((client) => client.query<{ decision: string }>(
        "SELECT decision FROM profile_review_decisions WHERE revision_id=$1", [revisionId]));
      expect(outcomes.rows).toHaveLength(1);
      const head = await withTestDatabase((client) => client.query<{ current_accepted_revision_id: string | null }>(
        "SELECT current_accepted_revision_id FROM profile_records WHERE id=(SELECT record_id FROM profile_revisions WHERE id=$1)",
        [revisionId]));
      expect(head.rows[0].current_accepted_revision_id).toBe(outcomes.rows[0].decision === "accept" ? revisionId : null);
      if (outcomes.rows[0].decision === "accept") {
        await withTestDatabase(async (client) => {
          await client.query("BEGIN");
          try {
            await submitProfileCommand(reviewer!, customerId, {
              action: "retract_revision", requestKey: randomUUID(), revisionId,
              expectedRecordVersion: 1, rationale: "Synthetic review race cleanup",
            }, client);
            await client.query("COMMIT");
          } catch (error) { await client.query("ROLLBACK"); throw error; }
        });
      }
    } finally { process.env.TURAS_ENVIRONMENT_ID = oldMarker; }
  });

  it("serializes two proposals for one canonical slot and keeps one accepted head", async () => {
    const oldMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      let contributor: CurrentSession | undefined;
      let reviewer: CurrentSession | undefined;
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          contributor = await session(client, "panel");
          reviewer = await session(client, "mcteer");
          await client.query("COMMIT");
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      });
      if (!contributor || !reviewer) throw new Error("Synthetic sessions unavailable");
      const key = `canonical-race-${randomUUID()}`;
      const propose = async () => withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const candidate = await submitProfileCommand(contributor!, customerId, {
            action: "propose_record", requestKey: randomUUID(), requestedAudience: "delivery",
            dataCategory: "delivery_context", payload: { ...product(), productKey: key },
          }, client) as { recordId: string; revisionId: string };
          await client.query("COMMIT");
          return candidate;
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      });
      const [first, second] = await Promise.all([propose(), propose()]);
      expect(first.recordId).toBe(second.recordId);
      expect(first.revisionId).not.toBe(second.revisionId);
      const canonical = await withTestDatabase((client) => client.query<{ id: string }>(
        `SELECT id FROM profile_records WHERE customer_id=$1 AND kind='product_use'
          AND canonical_key=$2`, [customerId, key]));
      expect(canonical.rows).toEqual([{ id: first.recordId }]);
      const digest = await withTestDatabase((client) => client.query<{ content_digest: string }>(
        "SELECT content_digest FROM profile_revisions WHERE id=$1", [first.revisionId]));
      const accept = await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const result = await submitProfileCommand(reviewer!, customerId, {
            action: "accept_revision", requestKey: randomUUID(), revisionId: first.revisionId,
            digest: digest.rows[0].content_digest, expectedRecordVersion: 0,
            expectedAcceptedRevisionId: null, rationale: "Synthetic canonical race reviewed",
          }, client);
          await client.query("COMMIT");
          return result;
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      });
      expect(accept).toMatchObject({ recordVersion: 1 });
      const laterDigest = await withTestDatabase((client) => client.query<{ content_digest: string }>(
        "SELECT content_digest FROM profile_revisions WHERE id=$1", [second.revisionId]));
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          await expect(submitProfileCommand(reviewer!, customerId, {
            action: "accept_revision", requestKey: randomUUID(), revisionId: second.revisionId,
            digest: laterDigest.rows[0].content_digest, expectedRecordVersion: 0,
            expectedAcceptedRevisionId: null, rationale: "Synthetic stale canonical candidate",
          }, client)).rejects.toMatchObject({ status: 409 });
        } finally { await client.query("ROLLBACK"); }
      });
      const head = await withTestDatabase((client) => client.query<{
        current_accepted_revision_id: string; version: string }>(
        "SELECT current_accepted_revision_id,version FROM profile_records WHERE id=$1",
        [first.recordId]));
      expect(head.rows[0]).toEqual({ current_accepted_revision_id: first.revisionId, version: "1" });
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          await submitProfileCommand(reviewer!, customerId, { action: "retract_revision",
            requestKey: randomUUID(), revisionId: first.revisionId, expectedRecordVersion: 1,
            rationale: "Synthetic canonical race cleanup" }, client);
          await client.query("COMMIT");
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = oldMarker; }
  });

  it("preserves the approved rating while a changed input waits for a new exact review", async () => {
    const oldMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const contributor = await session(client, "panel");
          const reviewer = await session(client, "mcteer");
          const quality = (R: number, D: number, C: number) => ({
            rubricVersion: "evidence-quality-v1", R, D, C,
            reliabilityRationale: "Synthetic authority review",
            directnessRationale: "Synthetic direct observation",
            corroborationRationale: "Synthetic corroboration review",
            informationType: "adoption_process", dateBasis: "observation",
          });
          const payload = { kind: "risk", category: `synthetic-${randomUUID()}`,
            description: "Synthetic delivery risk", owner: "Synthetic owner",
            likelihood: 2, impact: 3, severity: "medium",
            severityRationale: "Synthetic rating", mitigation: "Review mitigation",
            status: "open", observedAt: "2026-09-20T00:00:00Z" };
          const first = await submitProfileCommand(contributor, customerId, {
            action: "propose_record", requestKey: randomUUID(),
            requestedAudience: "delivery", dataCategory: "delivery_context",
            payload, qualityInput: quality(1, 2, 0),
          }, client) as { recordId: string; revisionId: string };
          const approve = async (revisionId: string, version: number, head: string | null) => {
            const digest = await client.query<{ content_digest: string }>(
              "SELECT content_digest FROM profile_revisions WHERE id=$1", [revisionId]);
            return submitProfileCommand(reviewer, customerId, {
              action: "accept_revision", requestKey: randomUUID(), revisionId,
              digest: digest.rows[0].content_digest, expectedRecordVersion: version,
              expectedAcceptedRevisionId: head, rationale: "Synthetic rating reviewed",
            }, client);
          };
          await approve(first.revisionId, 0, null);
          const initial = await client.query<{ input: { qualityInput: { R: number; D: number; C: number } };
            score: number }>("SELECT input,score FROM evidence_quality_snapshots WHERE profile_revision_id=$1",
          [first.revisionId]);
          expect(initial.rows).toHaveLength(1);
          expect(initial.rows[0].input.qualityInput).toMatchObject({ R: 1, D: 2, C: 0 });
          const changed = await submitProfileCommand(contributor, customerId, {
            action: "propose_revision", requestKey: randomUUID(), recordId: first.recordId,
            expectedRecordVersion: 1, expectedAcceptedRevisionId: first.revisionId,
            requestedAudience: "delivery", dataCategory: "delivery_context",
            payload: { ...payload, mitigation: "Synthetic updated mitigation" },
            qualityInput: quality(4, 4, 4),
          }, client) as { revisionId: string };
          const before = await client.query<{ current_accepted_revision_id: string }>(
            "SELECT current_accepted_revision_id FROM profile_records WHERE id=$1", [first.recordId]);
          expect(before.rows[0].current_accepted_revision_id).toBe(first.revisionId);
          expect((await client.query("SELECT 1 FROM evidence_quality_snapshots WHERE profile_revision_id=$1",
            [changed.revisionId])).rows).toHaveLength(0);
          await approve(changed.revisionId, 1, first.revisionId);
          const replacement = await client.query<{ input: { qualityInput: { R: number; D: number; C: number } };
            score: number }>("SELECT input,score FROM evidence_quality_snapshots WHERE profile_revision_id=$1",
          [changed.revisionId]);
          expect(replacement.rows).toHaveLength(1);
          expect(replacement.rows[0].input.qualityInput).toMatchObject({ R: 4, D: 4, C: 4 });
          expect(replacement.rows[0].score).toBeGreaterThan(initial.rows[0].score);
          const original = await client.query<{ input: { qualityInput: { R: number } } }>(
            "SELECT input FROM evidence_quality_snapshots WHERE profile_revision_id=$1", [first.revisionId]);
          expect(original.rows[0].input.qualityInput.R).toBe(1);
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = oldMarker; }
  });

  it("never lets a revoked steward win a concurrent exact acceptance", async () => {
    const oldMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      let panel: CurrentSession | undefined, admin: CurrentSession | undefined;
      const fixture = await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          panel = await session(client, "panel");
          admin = await session(client, "mcteer");
          const partner = await session(client, "partner");
          const assignment = await client.query<{ version: string; active: boolean }>(
            "SELECT version,active FROM customer_stewards WHERE customer_id=$1 AND membership_id=$2",
            [customerId, DEMO_IDS.panelMembership]);
          if (assignment.rows[0]?.active) throw new Error("Synthetic steward fixture already active");
          const version = Number(assignment.rows[0]?.version ?? 0);
          await submitProfileCommand(admin, customerId, { action: "assign_steward",
            requestKey: randomUUID(), membershipId: DEMO_IDS.panelMembership,
            expectedAssignmentVersion: version, rationale: "Synthetic race assignment" }, client);
          const proposed = await submitProfileCommand(partner, customerId, {
            action: "propose_record", requestKey: randomUUID(),
            requestedAudience: "delivery", dataCategory: "delivery_context",
            payload: { kind: "claim", text: `Synthetic steward race ${randomUUID()}`,
              sourceType: "manual" },
          }, client) as { revisionId: string; recordId: string };
          const digest = await client.query<{ content_digest: string }>(
            "SELECT content_digest FROM profile_revisions WHERE id=$1", [proposed.revisionId]);
          await client.query("COMMIT");
          return { ...proposed, digest: digest.rows[0].content_digest,
            assignmentVersion: version + 1 };
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      });
      if (!panel || !admin) throw new Error("Synthetic sessions unavailable");
      const run = (actor: CurrentSession, command: Record<string, unknown>) =>
        withTestDatabase(async (client) => {
          await client.query("BEGIN");
          try {
            const result = await submitProfileCommand(actor, customerId, command, client);
            await client.query("COMMIT"); return result;
          } catch (error) { await client.query("ROLLBACK"); throw error; }
        });
      const [decision, revocation] = await Promise.allSettled([
        run(panel, { action: "accept_revision", requestKey: randomUUID(),
          revisionId: fixture.revisionId, digest: fixture.digest,
          expectedRecordVersion: 0, expectedAcceptedRevisionId: null,
          rationale: "Synthetic steward race review",
          partnerSafeReason: "Reviewed delivery evidence" }),
        run(admin, { action: "revoke_steward", requestKey: randomUUID(),
          membershipId: DEMO_IDS.panelMembership,
          expectedAssignmentVersion: fixture.assignmentVersion,
          rationale: "Synthetic steward race revocation" }),
      ]);
      expect(revocation.status).toBe("fulfilled");
      if (decision.status === "rejected") expect(decision.reason).toMatchObject({ status: 403 });
      const state = await withTestDatabase((client) => client.query<{
        current_accepted_revision_id: string | null; active: boolean }>(`
        SELECT r.current_accepted_revision_id,s.active FROM profile_records r
        JOIN customer_stewards s ON s.customer_id=r.customer_id AND s.membership_id=$2
        WHERE r.id=$1`, [fixture.recordId, DEMO_IDS.panelMembership]));
      expect(state.rows[0].active).toBe(false);
      expect(state.rows[0].current_accepted_revision_id)
        .toBe(decision.status === "fulfilled" ? fixture.revisionId : null);
      if (decision.status === "fulfilled") {
        await run(admin, { action: "retract_revision", requestKey: randomUUID(),
          revisionId: fixture.revisionId, expectedRecordVersion: 1,
          rationale: "Synthetic steward race cleanup" });
      }
    } finally { process.env.TURAS_ENVIRONMENT_ID = oldMarker; }
  });

  it("attributes self-review and removes steward authority immediately on revocation", async () => {
    const oldMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const admin = await session(client, "mcteer");
          const panel = await session(client, "panel");
          const assignment = await client.query<{ version: string; active: boolean }>(
            "SELECT version,active FROM customer_stewards WHERE customer_id=$1 AND membership_id=$2",
            [customerId, DEMO_IDS.panelMembership]);
          expect(assignment.rows[0]?.active).not.toBe(true);
          const assignmentVersion = Number(assignment.rows[0]?.version ?? 0);
          await submitProfileCommand(admin, customerId,
            { requestKey: randomUUID(), action: "assign_steward",
              membershipId: DEMO_IDS.panelMembership, expectedAssignmentVersion: assignmentVersion,
              rationale: "Synthetic stewardship" }, client);
          const pending = await submitProfileCommand(panel, customerId,
            { requestKey: randomUUID(), action: "propose_record",
              payload: { kind: "claim", text: "Synthetic self-review claim", sourceType: "manual" },
              requestedAudience: "delivery", dataCategory: "delivery_context" }, client) as { revisionId: string };
          const digest = await client.query<{ content_digest: string }>(
            "SELECT content_digest FROM profile_revisions WHERE id=$1", [pending.revisionId]);
          await submitProfileCommand(panel, customerId,
            { requestKey: randomUUID(), action: "accept_revision", revisionId: pending.revisionId,
              digest: digest.rows[0].content_digest, expectedRecordVersion: 0,
              expectedAcceptedRevisionId: null, rationale: "Reviewed own synthetic claim" }, client);
          const decision = await client.query<{ reviewer_membership_id: string }>(
            "SELECT reviewer_membership_id FROM profile_review_decisions WHERE revision_id=$1",
            [pending.revisionId]);
          expect(decision.rows[0].reviewer_membership_id).toBe(DEMO_IDS.panelMembership);
          await submitProfileCommand(admin, customerId,
            { requestKey: randomUUID(), action: "revoke_steward",
              membershipId: DEMO_IDS.panelMembership, expectedAssignmentVersion: assignmentVersion + 1,
              rationale: "Synthetic revocation" }, client);
          const next = await submitProfileCommand(panel, customerId,
            { requestKey: randomUUID(), action: "propose_record",
              payload: { kind: "claim", text: "Another pending claim", sourceType: "manual" },
              requestedAudience: "delivery", dataCategory: "delivery_context" }, client) as { revisionId: string };
          await expect(submitProfileCommand(panel, customerId,
            { requestKey: randomUUID(), action: "reject_revision", revisionId: next.revisionId,
              expectedRecordVersion: 0, rationale: "Unauthorized review" }, client))
            .rejects.toMatchObject({ status: 403 });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = oldMarker; }
  });

  it("binds receipts to the customer as well as the actor and request key", async () => {
    const oldMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const admin = await session(client, "mcteer");
          const command = { requestKey: randomUUID(), action: "propose_record",
            payload: { kind: "claim", text: "Customer scoped synthetic claim", sourceType: "manual" } };
          await submitProfileCommand(admin, customerId, command, client);
          await expect(submitProfileCommand(admin, DEMO_IDS.deniedCustomer, command, client))
            .rejects.toMatchObject({ status: 409 });
          const wrongCustomer = await client.query(`SELECT 1 FROM profile_command_receipts
            WHERE workspace_id=$1 AND customer_id=$2 AND actor_membership_id=$3 AND request_key=$4`,
          [DEMO_IDS.workspace, DEMO_IDS.deniedCustomer, admin.membershipId, command.requestKey]);
          expect(wrongCustomer.rows).toHaveLength(0);
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = oldMarker; }
  });
});
