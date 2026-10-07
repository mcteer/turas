import { generalResponseScope } from "../../lib/server/conversations/general-context";
import { responseFeature } from "../../lib/server/conversations/feature";
import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { planDraftContentSchema } from "../../lib/contracts/plan-content";
import { HttpFailure,hiddenRecord } from "../../lib/contracts/http";
import { withTransaction } from "../../lib/server/db/client";
import { boundToolActor } from "../../lib/server/profiles/tool-actor";
import { readPlan } from "../../lib/server/plans/read";
import { recordPlanRead } from "../../lib/server/plans/drafting";

const partSchema=z.enum(["complete","sections","assertions","diagrams","designDecisions",
  "workPackages","milestones","reusedSolutions"]);

export const authoredTool = defineTool({
  description: "Read the exact editable base plan for the active planning attempt. The default complete view returns the full content when it fits the context budget; use named parts and offsets for larger plans. The server fixes plan, revision, audience and workload; withheld content is never returned.",
  inputSchema:z.object({part:partSchema.default("complete"),
    offset:z.number().int().min(0).max(100).default(0),
    sourceOffset:z.number().int().min(0).max(40).default(0)}).strict(),
  async execute(input,ctx) {
    return withTransaction(async(client)=>{
      const bound=await boundToolActor(client,ctx.session.auth.current);
      if (!bound.planning) throw hiddenRecord();
      const found=await client.query<{id:string;base_revision_id:string}>(`
        SELECT id,base_revision_id FROM plan_drafting_attempts
        WHERE response_attempt_id=$1 AND plan_id=$2`,
      [bound.attemptId,bound.planning.planId]);
      const attempt=found.rows[0];
      if (!attempt) throw hiddenRecord();
      const detail=await readPlan(bound.actor,bound.planning.planId,
        attempt.base_revision_id,client);
      if (!["readable","historical_warning"].includes(detail.contentAvailability) ||
          !detail.content) {
        throw new HttpFailure(409,"plan_content_unavailable",
          "Plan content needs fresh review");
      }
      const stored=detail.content as Record<string,unknown>;
      const editable={...stored,sections:Array.isArray(stored.sections) ?
        stored.sections.filter((section)=>typeof section==="object" &&
          section!==null && !["evidence","decision"].includes(
            (section as {key?:string}).key ?? "")):[]};
      const parsed=planDraftContentSchema.safeParse(editable);
      if (!parsed.success) throw new HttpFailure(409,"plan_content_unavailable",
        "Plan content needs fresh review");
      const content=parsed.data;
      if(input.part==="complete"){
        const complete={planId:detail.planId,revisionId:detail.revisionId,
          contentDigest:detail.contentDigest,
          historicalWarning:detail.contentAvailability==="historical_warning",
          part:"complete" as const,content,
          truncated:false};
        const visible=JSON.stringify(complete);
        if(Buffer.byteLength(visible,"utf8")<=12_000){
          await recordPlanRead(client,bound.actor,attempt.id,detail.revisionId,
            visible,content.sourceDependencies);
          return complete;
        }
        return {planId:detail.planId,revisionId:detail.revisionId,
          contentDigest:detail.contentDigest,
          historicalWarning:detail.contentAvailability==="historical_warning",
          part:"complete" as const,
          truncated:true,availableParts:partSchema.options.filter((part)=>
            part!=="complete")};
      }
      const collection=content[input.part];
      const selected=[...collection.slice(input.offset,input.offset+3)];
      const sources=[...content.sourceDependencies.slice(input.sourceOffset,
        input.sourceOffset+10)];
      let result={planId:detail.planId,revisionId:detail.revisionId,
        contentDigest:detail.contentDigest,
        historicalWarning:detail.contentAvailability==="historical_warning",
        title:content.title,asOf:content.asOf,
        part:input.part,offset:input.offset,totalItems:collection.length,
        items:selected,sourceOffset:input.sourceOffset,
        totalSources:content.sourceDependencies.length,sources,
        truncated:false};
      let visible=JSON.stringify(result);
      while (Buffer.byteLength(visible,"utf8")>12_000 &&
          (selected.length || sources.length)) {
        if (selected.length && (!sources.length ||
            JSON.stringify(selected.at(-1)).length>=JSON.stringify(sources.at(-1)).length)) {
          selected.pop();
        } else {sources.pop();}
        result={...result,items:selected,sources,truncated:true};
        visible=JSON.stringify(result);
      }
      if (Buffer.byteLength(visible,"utf8")>12_000) {
        throw new HttpFailure(413,"plan_context_budget",
          "Planning context limit reached");
      }
      await recordPlanRead(client,bound.actor,attempt.id,detail.revisionId,
        visible,sources);
      return result;
    });
  },
});

export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) {
    const feature = await responseFeature(ctx.session.auth.current);
    return feature?.kind !== "staffing" && feature?.kind !== "execution" && feature?.kind !== "support" && !await generalResponseScope(ctx.session.auth.current) ? authoredTool : null;
  },
} });
