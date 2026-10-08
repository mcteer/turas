import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";
import { withTransaction } from "../../lib/server/db/client";
import { boundToolActor } from "../../lib/server/profiles/tool-actor";
import { consumeResearchRun, executeResearchSearch, executeResearchFetch,
  finishResearchRun } from "../../lib/server/research/execution";
import { ingestCheckedObservation } from "../../lib/server/research/ingest";
import { readResearchRun } from "../../lib/server/research/requests";
import { readResearchFindings } from "../../lib/server/research/read";
import { recordRetrievalConsumption } from "../../lib/server/retrieval/fences";
import { resolveRetrievalCitation } from "../../lib/server/retrieval/citations";

type Principal = Parameters<typeof boundToolActor>[1];

async function stepConsume(principal: Principal) {
  "use step";
  return withTransaction(async (client) => {
    const bound = await boundToolActor(client,principal);
    return consumeResearchRun(client,bound.actor,bound.attemptId);
  });
}

async function stepSearch(principal: Principal,runId: string,index: number) {
  "use step";
  const bound = await withTransaction((client) => boundToolActor(client,principal));
  return executeResearchSearch(bound.actor,runId,index);
}

async function stepFetch(principal: Principal,runId: string,index: number,url: string) {
  "use step";
  const bound = await withTransaction((client) => boundToolActor(client,principal));
  const observationId = await executeResearchFetch(bound.actor,runId,index,url);
  if (!observationId) return { observationId: null,attributed: false };
  try {
    const result = await withTransaction((client) =>
      ingestCheckedObservation(client,bound.actor,observationId));
    return { observationId,attributed: result.attributed };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error &&
      error.code === "research_source_unverified") {
      return { observationId,attributed: false };
    }
    throw error;
  }
}

async function stepFit(principal: Principal,runId: string,
  receiptIds: readonly string[]) {
  "use step";
  return withTransaction(async (client) => {
    const bound = await boundToolActor(client,principal);
    const attempt = await client.query<{ conversation_id: string }>(`
      SELECT conversation_id FROM response_attempts WHERE id=$1`,[bound.attemptId]);
    if (!attempt.rows[0]) throw new Error("Research context unavailable");
    const evidence = [];
    for (const id of receiptIds) {
      await recordRetrievalConsumption(client,bound.actor,id,attempt.rows[0].conversation_id);
      const found = await client.query<{ citation_ids: string[] }>(`
        SELECT citation_ids FROM retrieval_receipts WHERE id=$1`,[id]);
      for (const citationId of found.rows[0]?.citation_ids ?? []) {
        if (evidence.length >= 10) break;
        const citation = await resolveRetrievalCitation(client,bound.actor,citationId);
        evidence.push(citation);
      }
      if (evidence.length >= 10) break;
    }
    if (Buffer.byteLength(JSON.stringify(evidence)) > 24_576) {
      throw new Error("Fit evidence exceeds result budget");
    }
    await finishResearchRun(client,bound.actor,runId,0);
    return { mode: "fit" as const,evidence,
      gaps: evidence.length ? [] : ["No current eligible evidence was selected"],
      followUp: "A new user-started public research request is required for missing evidence" };
  });
}

async function stepFinish(principal: Principal,runId: string,plannedFetches: number) {
  "use step";
  return withTransaction(async (client) => {
    const bound = await boundToolActor(client,principal);
    await finishResearchRun(client,bound.actor,runId,plannedFetches);
    const receipt = await readResearchRun(client,bound.actor,runId);
    const findings = await readResearchFindings(client,bound.actor,runId);
    const shown = findings;
    return { receipt,findings: shown,omittedFindingCount: findings.length-shown.length,
      gaps: findings.length ? [] : ["No attributed public passage passed the source checks"] };
  });
}

export default defineWorkflowTool({
  description: "Complete the public research request already admitted for this exact owned turn. The server loads mode and outbound scope; model arguments cannot change them. Recon researches a confirmed public identity, practices researches public product guidance, and fit uses governed evidence only. User-submitted links stay Pending.",
  inputSchema: z.object({}).strict(),
  async execute(_input,ctx) {
    "use workflow";
    const scope = await stepConsume(ctx.session.auth.current);
    if (scope.mode === "fit") {
      const ids = Array.isArray(scope.publicFields.evidenceReceiptIds) ?
        scope.publicFields.evidenceReceiptIds.filter((id): id is string => typeof id === "string") : [];
      return stepFit(ctx.session.auth.current,scope.id,ids);
    }
    const discovered: string[] = [];
    for (let index = 0; index < scope.queries.length; index += 1) {
      try {
        const urls = await stepSearch(ctx.session.auth.current,scope.id,index);
        discovered.push(...urls);

      } catch (error) {
        if (error && typeof error === "object" && "code" in error &&
          typeof error.code === "string" && ["research_not_running","deadline_exceeded",
            "provider_unconfirmed","research_context_changed","research_scope_changed"].includes(error.code)) {
          throw error;
        }
      }
    }
    const submitted = Array.isArray(scope.publicFields.submittedUrls) ?
      scope.publicFields.submittedUrls.filter((url): url is string => typeof url === "string") : [];
    const urls = [...new Set([...submitted,...discovered])].slice(0,8);
    let attemptedFetches = 0;
    for (const [index,url] of urls.entries()) {
      attemptedFetches += 1;
      try {
        const checked = await stepFetch(ctx.session.auth.current,scope.id,index,url);
        void checked;
      }
      catch (error) {
        if (error && typeof error === "object" && "code" in error &&
          typeof error.code === "string" && ["research_not_running","deadline_exceeded",
          "provider_unconfirmed"].includes(error.code)) throw error;
      }
    }
    return stepFinish(ctx.session.auth.current,scope.id,attemptedFetches);
  },
});
