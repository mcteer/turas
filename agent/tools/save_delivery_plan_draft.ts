import { generalResponseScope } from "../../lib/server/conversations/general-context";
import { staffingResponseScope } from "../../lib/server/staffing/native-context";
import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { editablePlanSectionKeys,planDraftContentSchema } from "../../lib/contracts/plan-content";
import { HttpFailure,hiddenRecord } from "../../lib/contracts/http";
import { withTransaction } from "../../lib/server/db/client";
import { boundToolActor } from "../../lib/server/profiles/tool-actor";
import { readPlan } from "../../lib/server/plans/read";
import { savePlanDraft } from "../../lib/server/plans/drafting";

const sectionUpdate=z.object({key:z.enum(editablePlanSectionKeys),
  state:z.enum(["content","unknown","not_applicable"]).optional(),
  narrative:z.string().max(4_000).optional(),
  ownerRole:z.string().max(4_000).optional(),
  discoveryAction:z.string().max(4_000).optional(),
  reason:z.string().max(4_000).optional()}).strict();
const assertionUpdate=z.object({key:z.string().max(64),text:z.string().max(4_000),
  kind:z.enum(["accepted_fact","attributed_research","shared_practice",
    "proposal","estimate","assumption"]),
  sourceDependencyIds:z.array(z.uuid()).max(10),
  decisionCritical:z.boolean(),ownerRole:z.string().max(4_000).optional(),
  validationAction:z.string().max(4_000).optional()}).strict();

export const authoredTool = defineTool({
  description: "Save one delivery-plan-v1 proposal for this server-bound attempt. Read the exact base plan first, then send only changed sections and optional assertions. The server merges those changes into the base and validates the complete result. Keep factual assertions tied to the base plan's exact source dependency IDs. This never accepts or publishes a plan.",
  inputSchema:z.object({
    title:z.string().max(160).optional(),
    sectionUpdates:z.array(sectionUpdate).min(1).max(10),
    assertionUpdates:z.array(assertionUpdate).max(20).optional(),
    changeReason:z.string().trim().min(1).max(2_000),
  }).strict(),
  async execute(input,ctx) {
    return withTransaction(async(client)=>{
      const bound=await boundToolActor(client,ctx.session.auth.current);
      if (!bound.planning) throw hiddenRecord();
      const found=await client.query<{id:string;base_revision_id:string}>(
        `SELECT id,base_revision_id FROM plan_drafting_attempts
         WHERE response_attempt_id=$1 AND plan_id=$2`,
        [bound.attemptId,bound.planning.planId]);
      const attempt=found.rows[0];
      if (!attempt) throw hiddenRecord();
      const detail=await readPlan(bound.actor,bound.planning.planId,
        attempt.base_revision_id,client,15_000);
      if(!["readable","historical_warning"].includes(detail.contentAvailability) ||
          !detail.content)
        throw new HttpFailure(409,"plan_content_unavailable","Plan content needs fresh review");
      const stored=detail.content as Record<string,unknown>;
      const editable={...stored,sections:Array.isArray(stored.sections) ?
        stored.sections.filter((section)=>typeof section==="object" &&
          section!==null && !["evidence","decision"].includes(
            (section as {key?:string}).key ?? "")):[]};
      const base=planDraftContentSchema.safeParse(editable);
      if(!base.success)throw new HttpFailure(409,"plan_content_unavailable",
        "Plan content needs fresh review");
      const unique=new Set(input.sectionUpdates.map((update)=>update.key));
      if(unique.size!==input.sectionUpdates.length)
        throw new HttpFailure(422,"invalid_plan_draft","Duplicate section update");
      const updates=new Map(input.sectionUpdates.map((update)=>[update.key,update]));
      const timestamp=await client.query<{as_of:Date}>(
        "SELECT now() - interval '1 second' AS as_of");
      const content={...base.data,
        title:input.title ?? base.data.title,
        asOf:timestamp.rows[0].as_of.toISOString(),
        sections:base.data.sections.map((section)=>({
          ...section,...(updates.get(section.key) ?? {})})),
        assertions:input.assertionUpdates ?? base.data.assertions};
      const parsed=planDraftContentSchema.safeParse(content);
      if(!parsed.success){
        const issues=parsed.error.issues.slice(0,20).map((issue)=>({
          path:issue.path.join("."),code:issue.code,message:issue.message.slice(0,160),
        }));
        console.info(JSON.stringify({kind:"turas_plan_draft_validation",
          issuePaths:issues.map((issue)=>issue.path)}));
        return {saved:false,issues,requiresHumanReview:true};
      }
      const saved=await savePlanDraft(bound.actor,attempt.id,
        {content:parsed.data,changeReason:input.changeReason},client);
      return {saved:true,...saved,
        reviewLink:`/customers/${bound.customerId}/plans/${saved.planId}`,
        requiresHumanReview:true};
    });
  },
});

export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) {
    const scope = await staffingResponseScope(ctx.session.auth.current);
    return !scope && !await generalResponseScope(ctx.session.auth.current) ? authoredTool : null;
  },
} });
