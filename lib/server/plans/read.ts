import { createHmac,timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure,hiddenRecord } from "../../contracts/http";
import { planPageQuerySchema } from "../../contracts/plans";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import type { PlanActor } from "./policy";
import type { CurrentReadActor } from '../auth/read-actor';
import {lockLearningOriginalClosure} from '../learning/sources';
import {knowledgeLineageIsCurrent} from '../profiles/eligibility';
import { lockPlanActor,requirePlanCapability } from "./policy";
import { loadPlan,latestPlanRevision } from "./repository";
import { currentPlanSourceDigest } from "./sources";
import { assessPlanEvidence } from "./sources";
import { planDraftContentSchema,planEvidenceSummarySchema } from "../../contracts/plan-content";
import { recordSampledPlanReadDuration } from "./telemetry";

export type PlanAvailability = "readable"|"historical_warning"|"withheld"|"purged";
export type PlanDetail = {contractVersion:"delivery-plan-v1";planId:string;
  customerId:string;workloadId:string|null;audience:"internal"|"delivery";
  revisionId:string;revisionNumber:number;aggregateVersion:number;
  contentDigest:string;
  reviewState:string;acceptedRevisionId:string|null;engagementId:string|null;
  contentAvailability:PlanAvailability;reviewRequired:boolean;
  canRevise:boolean;canReview:boolean;
  title:string;changeReason:string|null;content:unknown|null;createdAt:string};
export type PlanSummary=Omit<PlanDetail,"content">;
type InternalPageRow={id:string;updated_at:Date;customer_id:string;
  workload_id:string|null;audience:"internal"|"delivery";
  accepted_revision_id:string|null;engagement_id:string|null;
  aggregate_version:string;revision_id:string;revision_number:string;
  content_digest:string;created_at:Date;title:string|null;
  has_content:boolean|null;evidence_content:unknown|null;
  change_reason:string|null;review_state:string;has_sources:boolean};

function cursorSecret():string { return getServerConfig().TURAS_MAINTENANCE_SECRET; }
function sign(value:string):string {
  return createHmac("sha256",cursorSecret()).update(value).digest("base64url");
}
function encodeCursor(value:object):string {
  const body=Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${body}.${sign(body)}`;
}
function decodeCursor(cursor:string,scope:object):{updatedAt:string;id:string} {
  const [body,mac,extra]=cursor.split(".");
  if (!body || !mac || extra) throw hiddenRecord();
  const expected=Buffer.from(sign(body));
  const provided=Buffer.from(mac);
  if (expected.length!==provided.length || !timingSafeEqual(expected,provided)) throw hiddenRecord();
  let decoded:unknown;
  try { decoded=JSON.parse(Buffer.from(body,"base64url").toString("utf8")); }
  catch { throw hiddenRecord(); }
  if (!decoded || typeof decoded!=="object") throw hiddenRecord();
  const item=decoded as Record<string,unknown>;
  if (item.scope!==JSON.stringify(scope) || typeof item.updatedAt!=="string" ||
      typeof item.id!=="string") throw hiddenRecord();
  return {updatedAt:item.updatedAt,id:item.id};
}

async function revisionState(client:PoolClient,revisionId:string):Promise<string> {
  const result=await client.query<{state:string}>(`SELECT state FROM plan_revision_events
    WHERE revision_id=$1 ORDER BY event_order DESC LIMIT 1`,[revisionId]);
  return result.rows[0]?.state ?? "draft";
}

/** Explicit accepted head for governed external readers. Never falls back to a
 * working draft or an author-owned historical revision. */
export async function readAcceptedPlan(client:PoolClient,actor:CurrentReadActor,customerId:string,planId:string){
  await lockPlanActor(client,actor,customerId,false);
  const plan=(await client.query<import('./policy').PlanScope>(`SELECT * FROM delivery_plans
    WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 FOR SHARE`,
    [planId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId])).rows[0];
  if(!plan || !plan.accepted_revision_id)return null;
  requirePlanCapability(actor,plan,'read');
  const revision=await latestPlanRevision(client,plan.id,plan.accepted_revision_id);
  if(await revisionState(client,revision.id)!=='accepted')return null;
  try{
    const sources=(await client.query<{source_kind:string;source_revision_id:string}>(`SELECT source_kind,source_revision_id FROM plan_source_dependencies WHERE revision_id=$1
      ORDER BY source_kind,source_revision_id`,[revision.id])).rows;
    for(const source of sources){
      if(source.source_kind==='shared_knowledge'){if(!await knowledgeLineageIsCurrent(client,source.source_revision_id,true))return null;}
      else if(['accepted_profile','approved_excerpt','verified_research'].includes(source.source_kind)){
        const originals=await lockLearningOriginalClosure(client,actor.workspaceId,customerId,[{sourceKind:source.source_kind as 'accepted_profile'|'approved_excerpt'|'verified_research',sourceRevisionId:source.source_revision_id}]);
        if(originals.some(original=>['commercial','personnel'].includes(String(original.rights.data_category))))return null;
      }else return null;
    }
    await currentPlanSourceDigest(client,actor,revision.id,customerId,plan.workload_id,plan.audience,true,true);
    const payload=(await client.query<{content:Record<string,unknown>}>('SELECT content FROM plan_revision_payloads WHERE revision_id=$1 FOR SHARE',[revision.id])).rows[0];
    if(!payload)return null;
    const editable={...payload.content,sections:Array.isArray(payload.content.sections)?payload.content.sections.filter(section=>
      section&&typeof section==='object'&&!['evidence','decision'].includes((section as {key:string}).key)):[]};
    const parsed=planDraftContentSchema.safeParse(editable);if(!parsed.success)return null;
    const evidence=await assessPlanEvidence(client,actor,customerId,parsed.data);
    if(evidence.historicalWarning || evidence.issues.length)return null;
    return {plan,revision,content:parsed.data};
  }catch(error){if(error instanceof HttpFailure&&[404,409].includes(error.status))return null;throw error;}
}

export async function readPlan(actor:PlanActor,planId:string,revisionId?:string,
  existingClient?:PoolClient,statementTimeoutMs?:number):Promise<PlanDetail> {
  const started=Date.now();
  const execute=async (client:PoolClient) => {
    const plan=await loadPlan(client,actor,planId);
    await lockPlanActor(client,actor,plan.customer_id,false);
    if (statementTimeoutMs!==undefined) {
      if (!Number.isSafeInteger(statementTimeoutMs) || statementTimeoutMs<5_000 ||
          statementTimeoutMs>15_000) throw new Error("Invalid plan read timeout");
      await client.query(`SET LOCAL statement_timeout = '${statementTimeoutMs}ms'`);
    }
    requirePlanCapability(actor,plan,"read");
    let selected=revisionId ?? plan.working_revision_id ?? plan.accepted_revision_id;
    if (actor.kind==="partner" && plan.created_by_membership_id!==actor.membershipId) {
      selected=revisionId ?? plan.accepted_revision_id;
    }
    if (!selected) throw hiddenRecord();
    let revision=await latestPlanRevision(client,plan.id,selected);
    if (actor.kind==="partner" && !revisionId &&
        revision.author_membership_id!==actor.membershipId &&
        selected!==plan.accepted_revision_id && plan.accepted_revision_id) {
      selected=plan.accepted_revision_id;
      revision=await latestPlanRevision(client,plan.id,selected);
    }
    const state=await revisionState(client,selected);
    const partnerCanRead=actor.kind!=="partner" ||
      (plan.audience==="delivery" &&
        (revision.author_membership_id===actor.membershipId ||
          ["accepted","superseded"].includes(state)));
    if (!partnerCanRead) throw hiddenRecord();
    const payload=await client.query<{title:string;content:unknown;change_reason:string|null}>(
      "SELECT title,content,change_reason FROM plan_revision_payloads WHERE revision_id=$1 FOR SHARE",[selected]);
    let availability:PlanAvailability="readable";
    let qualityReview=false;
    if (!payload.rows[0]) availability="purged";
    else {
      try {
        await currentPlanSourceDigest(client,actor,selected,plan.customer_id,
          plan.workload_id,plan.audience,true,true);
        const stored=payload.rows[0].content as Record<string,unknown>;
        const editable={...stored,sections:Array.isArray(stored.sections) ?
          stored.sections.filter((item)=>typeof item==="object" && item!==null &&
            !["evidence","decision"].includes((item as {key?:string}).key ?? "")):[]};
        const parsed=planDraftContentSchema.safeParse(editable);
        if (parsed.success) {
          const assessment=await assessPlanEvidence(client,actor,plan.customer_id,parsed.data);
          if (assessment.historicalWarning) availability="historical_warning";
          qualityReview=assessment.issues.length>0;
        } else {availability="withheld";}
      } catch (error) {
        if (!(error instanceof HttpFailure) || ![404,409].includes(error.status)) throw error;
        availability="withheld";
      }
    }
    return {contractVersion:"delivery-plan-v1" as const,planId:plan.id,
      customerId:plan.customer_id,workloadId:plan.workload_id,audience:plan.audience,
      revisionId:selected,revisionNumber:Number(revision.revision_number),
      contentDigest:revision.content_digest,
      aggregateVersion:Number(plan.aggregate_version),reviewState:state,
      acceptedRevisionId:plan.accepted_revision_id,engagementId:plan.engagement_id,
      contentAvailability:availability,reviewRequired:availability!=="readable" || qualityReview,
      canRevise:actor.kind==="internal" || plan.created_by_membership_id===actor.membershipId,
      canReview:actor.kind==="internal" && actor.role==="admin",
      title:availability==="readable" || availability==="historical_warning"
        ? payload.rows[0].title : "Review required",
      changeReason:availability==="readable" || availability==="historical_warning"
        ? payload.rows[0].change_reason : null,
      content:availability==="readable" || availability==="historical_warning"
        ? payload.rows[0].content : null,
      createdAt:revision.created_at.toISOString()};
  };
  try {return await (existingClient ? execute(existingClient) : withTransaction(execute));}
  finally {recordSampledPlanReadDuration(Math.max(0,Date.now()-started));}
}

export async function listPlans(actor:PlanActor,customerId:string,
  options:{workloadId?:string|null;limit?:number;cursor?:string}={},
  existingClient?:PoolClient):Promise<{items:PlanSummary[];nextCursor:string|null}> {
  const started=Date.now();
  const query=planPageQuerySchema.parse({limit:options.limit,cursor:options.cursor});
  const execute=async (client:PoolClient) => {
    await lockPlanActor(client,actor,customerId,false);
    const scope={actor:actor.membershipId,customerId,workloadId:options.workloadId ?? null};
    let cursor=query.cursor ? decodeCursor(query.cursor,scope) : null;
    const items:PlanSummary[]=[];
    let more=false;
    for (let page=0;page<20 && items.length<query.limit;page += 1) {
      let pageRows:{id:string;updated_at:Date}[];
      let internalRows:InternalPageRow[]=[];
      if(actor.kind==="internal") {
        const selected=await client.query<InternalPageRow>(`WITH page AS (
          SELECT * FROM delivery_plans WHERE environment_id=$1 AND workspace_id=$2
            AND customer_id=$3 AND ($4::uuid IS NULL OR workload_id=$4)
            AND ($5::timestamptz IS NULL OR (updated_at,id)<($5,$6::uuid))
          ORDER BY updated_at DESC,id DESC LIMIT $7
        ) SELECT plan.id,plan.updated_at,plan.customer_id,plan.workload_id,
          plan.audience,plan.accepted_revision_id,plan.engagement_id,
          plan.aggregate_version,revision.id AS revision_id,
          revision.revision_number,revision.content_digest,revision.created_at,
          payload.title,payload.has_content,payload.evidence_content,
          payload.change_reason,COALESCE(event.state,'draft') AS review_state,
          deps.has_sources FROM page plan
          JOIN plan_revisions revision ON revision.id=COALESCE(
            plan.working_revision_id,plan.accepted_revision_id)
          LEFT JOIN LATERAL (SELECT title,content IS NOT NULL AS has_content,
            jsonb_build_object('assertions',content->'assertions',
              'sourceDependencies',content->'sourceDependencies') AS evidence_content,
            change_reason FROM plan_revision_payloads
            WHERE revision_id=revision.id FOR SHARE) payload ON true
          LEFT JOIN LATERAL (SELECT state FROM plan_revision_events
            WHERE revision_id=revision.id ORDER BY event_order DESC LIMIT 1) event ON true
          LEFT JOIN LATERAL (SELECT
            (EXISTS(SELECT 1 FROM plan_source_dependencies source
              WHERE source.revision_id=revision.id) OR
             EXISTS(SELECT 1 FROM plan_private_dependencies source
              WHERE source.revision_id=revision.id)) AS has_sources) deps ON true
          ORDER BY plan.updated_at DESC,plan.id DESC`,
        [getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,
          options.workloadId ?? null,cursor?.updatedAt ?? null,cursor?.id ?? null,
          query.limit-items.length]);
        internalRows=selected.rows;
        pageRows=internalRows.map((row)=>({id:row.id,updated_at:row.updated_at}));
      } else {
        const selected=await client.query<{id:string;updated_at:Date}>(`SELECT id,updated_at
        FROM delivery_plans WHERE environment_id=$1 AND workspace_id=$2
          AND customer_id=$3 AND ($4::uuid IS NULL OR workload_id=$4)
          AND ($5::boolean OR (audience='delivery' AND
            (created_by_membership_id=$6 OR accepted_revision_id IS NOT NULL)))
          AND ($7::timestamptz IS NULL OR (updated_at,id)<($7,$8::uuid))
        ORDER BY updated_at DESC,id DESC LIMIT $9`,
      [getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,
        options.workloadId ?? null,false,actor.membershipId,
        cursor?.updatedAt ?? null,cursor?.id ?? null,
        50]);
        pageRows=selected.rows;
      }
      if (!pageRows.length) break;
      const fast=new Map<string,PlanSummary>();
      if(actor.kind==="internal") {
        for(const row of internalRows){
          let availability:PlanAvailability=row.has_content ? "readable":"purged";
          let qualityReview=false;
          if(row.has_content && row.has_sources){
            const parsed=planEvidenceSummarySchema.safeParse(row.evidence_content);
            if(!parsed.success)availability="withheld";
            else {
              try {
                await currentPlanSourceDigest(client,actor,row.revision_id,
                  row.customer_id,row.workload_id,row.audience,true,true);
                const evidence=await assessPlanEvidence(client,actor,row.customer_id,
                  parsed.data);
                if(evidence.historicalWarning)availability="historical_warning";
                qualityReview=evidence.issues.length>0;
              } catch(error){
                if(!(error instanceof HttpFailure) || ![404,409].includes(error.status))throw error;
                availability="withheld";
              }
            }
          }
          fast.set(row.id,{contractVersion:"delivery-plan-v1",planId:row.id,
            customerId:row.customer_id,workloadId:row.workload_id,
            audience:row.audience,revisionId:row.revision_id,
            revisionNumber:Number(row.revision_number),
            aggregateVersion:Number(row.aggregate_version),
            contentDigest:row.content_digest,reviewState:row.review_state,
            acceptedRevisionId:row.accepted_revision_id,engagementId:row.engagement_id,
            contentAvailability:availability,
            reviewRequired:availability!=="readable" || qualityReview,
            canRevise:true,canReview:actor.role==="admin",
            title:availability==="readable" || availability==="historical_warning"
              ? row.title! : "Review required",
            changeReason:availability==="readable" || availability==="historical_warning"
              ? row.change_reason:null,
            createdAt:row.created_at.toISOString()});
        }
      }
      for (const row of pageRows) {
        cursor={updatedAt:row.updated_at.toISOString(),id:row.id};
        try {
          const summary=fast.get(row.id);
          if(summary)items.push(summary);
          else {
            const {content:_,...detail}=await readPlan(actor,row.id,undefined,client);
            items.push(detail);
          }
        }
        catch (error) {
          if (!(error instanceof HttpFailure) || error.status!==404) throw error;
        }
        if (items.length===query.limit) { more=true;break; }
      }
      if (pageRows.length<(actor.kind==="internal" ? query.limit-items.length : 50) || more) break;
    }
    return {items,nextCursor:more && cursor ? encodeCursor({...cursor,
      scope:JSON.stringify(scope)}) : null};
  };
  try {return await (existingClient ? execute(existingClient) : withTransaction(execute));}
  finally {recordSampledPlanReadDuration(Math.max(0,Date.now()-started));}
}

export async function readPlanHistory(actor:PlanActor,planId:string,
  options:{limit?:number;cursor?:string}={},existingClient?:PoolClient):Promise<{
    items:PlanDetail[];nextCursor:string|null}> {
  const query=planPageQuerySchema.parse(options);
  const execute=async (client:PoolClient) => {
    const plan=await loadPlan(client,actor,planId);
    await lockPlanActor(client,actor,plan.customer_id,false);
    requirePlanCapability(actor,plan,"read");
    let before:number|null=null;
    const scope={actor:actor.membershipId,planId,type:"history"};
    if (query.cursor) {
      const decoded=decodeCursor(query.cursor,scope);
      before=Number(decoded.updatedAt);
      if (!Number.isSafeInteger(before) || before<1 || decoded.id!==planId) throw hiddenRecord();
    }
    const items:PlanDetail[]=[];
    let more=false;
    for (let page=0;page<20 && items.length<query.limit;page += 1) {
      const rows=await client.query<{id:string;revision_number:string}>(`SELECT id,revision_number
        FROM plan_revisions WHERE plan_id=$1 AND ($2::bigint IS NULL OR revision_number<$2)
        ORDER BY revision_number DESC LIMIT 50`,[plan.id,before]);
      if (!rows.rows.length) break;
      for (const row of rows.rows) {
        before=Number(row.revision_number);
        try { items.push(await readPlan(actor,plan.id,row.id,client)); }
        catch (error) {
          if (!(error instanceof HttpFailure) || error.status!==404) throw error;
        }
        if (items.length===query.limit) { more=true;break; }
      }
      if (rows.rows.length<50 || more) break;
    }
    return {items,nextCursor:more && before!==null ? encodeCursor({
      scope:JSON.stringify(scope),updatedAt:String(before),id:planId}) : null};
  };
  return existingClient ? execute(existingClient) : withTransaction(execute);
}
