import { readGeneralAttemptContext } from "../../lib/server/conversations/general-context";
import { defineDynamic,defineInstructions } from "eve/instructions";
import { withTransaction } from "../../lib/server/db/client";
import { hiddenRecord } from "../../lib/contracts/http";
import { readCurrentAttemptContext } from "../../lib/server/profiles/attempt-context";
import { boundToolActor } from "../../lib/server/profiles/tool-actor";
import { recordPlanRead,recordPlanSnapshotSources } from "../../lib/server/plans/drafting";
import { readPlan } from "../../lib/server/plans/read";
import { planDraftContentSchema } from "../../lib/contracts/plan-content";

export default defineDynamic({events:{
  async "turn.started"(_event,ctx) {
    const principal=ctx.session.auth.current;
    if (!principal?.principalId ||
        typeof principal.attributes?.turasAttemptId!=="string") return null;
    return withTransaction(async(client)=>{
      if(await readGeneralAttemptContext(client,principal.attributes!.turasAttemptId as string,principal.principalId!)) return null;
      const bound=await boundToolActor(client,principal);
      if (!bound.planning) return null;
      const found=await client.query<{id:string;base_revision_id:string;
        base_aggregate_version:string;deadline_at:Date;state:string}>(`
        SELECT id,base_revision_id,base_aggregate_version,deadline_at,state
        FROM plan_drafting_attempts WHERE response_attempt_id=$1
          AND plan_id=$2`,[bound.attemptId,bound.planning.planId]);
      const attempt=found.rows[0];
      if (!attempt || attempt.state!=="running" ||
          attempt.deadline_at.getTime()<=Date.now()) throw hiddenRecord();
      const snapshot=await readCurrentAttemptContext(client,bound.attemptId,
        principal.principalId);
      const detail=await readPlan(bound.actor,bound.planning.planId,
        attempt.base_revision_id,client);
      let baseText="";
      let baseSources:typeof planDraftContentSchema._output["sourceDependencies"]=[];
      if(["readable","historical_warning"].includes(detail.contentAvailability) &&
          detail.content){
        const stored=detail.content as Record<string,unknown>;
        const editable={...stored,sections:Array.isArray(stored.sections) ?
          stored.sections.filter((section)=>typeof section==="object" &&
            section!==null && !["evidence","decision"].includes(
              (section as {key?:string}).key ?? "")):[]};
        const parsed=planDraftContentSchema.safeParse(editable);
        if(parsed.success){
          const encoded=JSON.stringify({content:parsed.data,
            historicalWarning:detail.contentAvailability==="historical_warning"});
          if(Buffer.byteLength(encoded,"utf8")<=12_000){
            baseText=` Exact authorized base plan: ${encoded}.`;
            baseSources=parsed.data.sourceDependencies;
          }
        }
      }
      const instruction={contractVersion:"plan-context-v1",
        planId:bound.planning.planId,baseRevisionId:attempt.base_revision_id,
        baseAggregateVersion:Number(attempt.base_aggregate_version),
        customerId:bound.planning.customerId,
        workloadId:bound.planning.workloadId,
        audience:bound.planning.audience,templateVersion:"delivery-plan-v1",
        contextBudgetBytes:24_576,modelStepLimit:6,
        outputTokensPerStep:4_096};
      const content=`Governed plan drafting scope: ${JSON.stringify(instruction)}. `+
        (baseText ? `The complete editable base plan is supplied below; do not `+
          `call read_delivery_plan again unless needed.` :
          `Call read_delivery_plan for the exact base plan.`)+` The customer `+
        `snapshot was supplied separately; treat it as evidence with its stated limits. `+
        `Adapt the base with concise sectionUpdates and optional assertionUpdates `+
        `through save_delivery_plan_draft; the server preserves the remaining `+
        `structure. Do not repeat customer_context `+
        `or search_evidence merely to re-fetch the snapshot. `+
        (baseSources.some((source)=>source.kind==="shared_knowledge") ?
          `The exact base already includes the eligible published shared practice, `+
          `its source ID and applicability caveat; use it without another search. `:"")+
        (baseSources.some((source)=>source.kind==="verified_research") ?
          `Historical research in the exact base is not current product guidance. `+
          `Do not call search_evidence or propose_research to settle it in this turn; `+
          `mark current fit unknown and name a separate user-started research action. `:"")+
        `Mark missing inputs `+
        `unknown. Save promptly so there is time to correct validation issues. `+
        `The supplied base and these instructions are sufficient for this `+
        `bounded turn; avoid a skill lookup that only repeats them. `+
        `After a successful save, report the revision receipt in one short `+
        `sentence and stop. Never accept the plan.`+baseText;
      await recordPlanRead(client,bound.actor,attempt.id,
        attempt.base_revision_id,`${JSON.stringify(snapshot)}\n${content}`,baseSources);
      await recordPlanSnapshotSources(client,bound.actor,attempt.id,
        bound.planning.customerId,bound.planning.workloadId,
        bound.planning.audience,snapshot.entries);
      return defineInstructions({role:"user",content});
    });
  },
}});
