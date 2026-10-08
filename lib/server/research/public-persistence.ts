import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { CurrentSession } from "../auth/sessions";
import { withTransaction } from "../db/client";
import { getServerConfig } from "../config";
import { lockWorkspaceActor, lockProfileActor } from "../profiles/policy";
import { HttpFailure } from "../../contracts/http";
import { materializeCurrentProjection, retireRetrievalProjection } from "../retrieval/projections";
import { enqueuePlanCleanupForSource } from "../plans/cleanup";
import { qualityInputSchema } from "../../contracts/profiles";
import { rateEvidence } from "../profiles/quality";
import { publicCustomerSchema, publicDigest, validatePublicDossier, assertCheckedPublicPage,
  type PublicCustomer, type CheckedPublicPage } from "./public-dossier";

const receiptSchema = z.object({ requestKey: z.uuid(), batchDigest: z.string().regex(/^[a-f0-9]{64}$/),
  customer: publicCustomerSchema, dossier: z.unknown(), usage: z.object({ searches: z.number().int().nonnegative().max(6),
    fetches: z.number().int().nonnegative().max(16), inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(), costUsd: z.number().nonnegative().nullable(),
    model: z.string().max(100), modelCalls: z.number().int().min(0).max(6) }).strict() }).strict();

/** Operator-only domain entry point. Never exposed as a model tool or upload route. */
export async function persistPublicCustomerResearch(actor: CurrentSession, raw: unknown,
  pages: readonly CheckedPublicPage[], targetCustomerId?: string) {
  const input = receiptSchema.parse(raw);
  for(const page of pages)assertCheckedPublicPage(page);
  const dossier = validatePublicDossier(input.dossier, input.customer, pages);
  const digest = publicDigest(JSON.stringify({ ...input, dossier, pages }));
  return withTransaction(async db => {
    await lockWorkspaceActor(db, actor);
    if (actor.kind !== "internal" || actor.role !== "admin") throw new HttpFailure(403,"forbidden","Research batch requires an active administrator");
    const marker = (await db.query("SELECT schema_version FROM turas_environment WHERE environment_id=$1", [getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    if (!marker || marker.schema_version < 45) throw new HttpFailure(503,"unavailable","Public research migration is required");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`public-research:${actor.workspaceId}:${input.requestKey}`]);
    const prior = (await db.query<{id:string;customer_id:string;input_digest:string}>(`SELECT id,customer_id,input_digest FROM public_customer_research_results
      WHERE environment_id=$1 AND workspace_id=$2 AND request_key=$3`, [getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,input.requestKey])).rows[0];
    if (prior) {
      if (prior.input_digest !== digest) throw new HttpFailure(409,"request_key_conflict","Research receipt changed");
      await lockProfileActor(db,actor,prior.customer_id);
      return { id:prior.id, customerId:prior.customer_id, replayed:true };
    }
    const customer = input.customer;
    const nameKey = customer.name.normalize("NFKC").toLocaleLowerCase("en-US");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`public-customer:${actor.workspaceId}:${nameKey}`]);
    const existing = await db.query<{id:string}>(`SELECT id FROM customer_references WHERE workspace_id=$1
      AND (($3::uuid IS NOT NULL AND id=$3) OR ($3::uuid IS NULL AND lower(display_name)=lower($2))) ORDER BY id`, [actor.workspaceId,customer.name,targetCustomerId??null]);
    if (existing.rows.length > 1 || targetCustomerId && !existing.rows.length) throw new HttpFailure(409,"identity_conflict","Resolve customer identity before research persistence");
    let customerId = existing.rows[0]?.id;
    if (!customerId) {
      // Public directory identity is a canonical anchor, not accepted private context.
      customerId = randomUUID();
      await db.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,$3,false)`, [customerId,actor.workspaceId,customer.name]);
      await db.query(`INSERT INTO customer_stewards(customer_id,workspace_id,membership_id,assigned_by) VALUES($1,$2,$3,$4)`, [customerId,actor.workspaceId,actor.membershipId,actor.principalId]);
    }
    await lockProfileActor(db,actor,customerId);
    const revisionIds:string[] = [];
    for (const [index,page] of pages.entries()) {
      const supported = dossier.findings.filter(finding=>finding.sourceIndex===index);
      if (!supported.length) continue;
      const passage = [...new Set(supported.map(f=>f.quote))].join("\n\n");
      if (passage.length>8000 || publicDigest(page.text)!==page.normalizedDigest || !/^https:\/\//.test(page.url)) throw new HttpFailure(422,"invalid_source","Public source receipt is invalid");
      const url = new URL(page.url); if(url.username || url.password)throw new HttpFailure(422,"invalid_source","Public source receipt is invalid");
      const source = (await db.query<{id:string}>(`SELECT id FROM evidence_sources WHERE workspace_id=$1 AND customer_id=$2
        AND origin='independent_research' AND canonical_location=$3 FOR UPDATE`, [actor.workspaceId,customerId,page.url])).rows[0];
      const sourceId=source?.id??randomUUID();
      if(!source)await db.query(`INSERT INTO evidence_sources(id,workspace_id,customer_id,origin,canonical_location,trusted_ingest_identity)
        VALUES($1,$2,$3,'independent_research',$4,'public-batch-fetch-v1')`,[sourceId,actor.workspaceId,customerId,page.url]);
      const previous=(await db.query<{id:string;version:number;passage_digest:string;retired:boolean}>(`SELECT v.id,v.version,v.passage_digest,
        EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=v.id AND e.event_type IN('withdraw','supersede')) AS retired
        FROM evidence_source_revisions v WHERE source_id=$1 ORDER BY version DESC LIMIT 1`,[sourceId])).rows[0];
      if(previous?.retired)throw new HttpFailure(409,"research_source_retired","Withdrawn public evidence requires explicit source recovery");
      const passageDigest=publicDigest(passage);
      const supplied=await db.query(`SELECT 1 FROM research_observations o JOIN research_runs r ON r.id=o.run_id
        LEFT JOIN research_observation_payloads payload ON payload.observation_id=o.id
        WHERE r.environment_id=$1 AND r.workspace_id=$2 AND r.customer_id=$3 AND o.origin='user_submission'
          AND (o.body_digest=$4 OR o.passage_digest=$5 OR o.normalized_digest=$6 OR payload.normalized_text=$7)
        UNION ALL SELECT 1 FROM evidence_sources WHERE workspace_id=$2 AND customer_id=$3 AND origin='manual' AND canonical_location=$8 LIMIT 1`,
        [getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,page.bodyDigest,passageDigest,page.fullNormalizedDigest??page.normalizedDigest,page.text,page.url]);
      if(supplied.rowCount)throw new HttpFailure(409,"submitted_origin","User-origin content cannot be promoted by public batch research");
      if(previous?.passage_digest===passageDigest&&!previous.retired){revisionIds.push(previous.id);continue;}
      const id=randomUUID();
      const quality=qualityInputSchema.parse({rubricVersion:"evidence-quality-v1", R:1,D:4,C:0,
        reliabilityRationale:"Attributed public source; publisher, speaker and workload ownership remain claim-specific and require steward review",
        directnessRationale:"Exact retained quotation from checked public fetch",corroborationRationale:"No independent corroboration automatically counted",
        informationType:"adoption_process",dateBasis:page.publishedAt?"publication":"unknown"});
      await db.query(`INSERT INTO evidence_source_revisions(id,source_id,workspace_id,customer_id,version,location,title,passage,supported_claim,
        passage_digest,publication_at,retrieval_at,rights,audience,quality_input) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'delivery',$14)`,
        [id,sourceId,actor.workspaceId,customerId,Number(previous?.version??0)+1,page.url,page.title||"Attributed public research",passage,
          supported.map(f=>`${f.attribution}: ${f.statement}${f.caveats.length?` Caveats: ${f.caveats.join('; ')}`:''}`).join("\n"),passageDigest,page.publishedAt,page.retrievedAt,
          "Public quotations with attribution; no license to redistribute full documents",JSON.stringify(quality)]);
      await db.query(`INSERT INTO research_checks(source_revision_id,trusted_ingest_identity,check_version,identity_result,scope_result,integrity_result,content_result,rationale)
        VALUES($1,'public-batch-fetch-v1','research-check-v3',true,true,true,true,$2)`,[id,JSON.stringify({batchDigest:input.batchDigest,bodyDigest:page.bodyDigest,
          normalizedDigest:page.normalizedDigest,subject:customer.name,scope:"Public attributed claims only; no internal fact acceptance"})]);
      const rating=rateEvidence({R:1,D:4,C:0,informationType:quality.informationType,dateBasis:quality.dateBasis,evidenceAt:page.publishedAt?new Date(page.publishedAt):null,asOf:new Date()});
      await db.query(`INSERT INTO evidence_quality_snapshots(id,source_revision_id,rubric_version,rating_actor,input,information_type,date_basis,as_of,freshness,score,band)
        VALUES($1,$2,$3,'public-batch-fetch-v1',$4,$5,$6,$7,$8,$9,$10)`,[randomUUID(),id,quality.rubricVersion,JSON.stringify(quality),quality.informationType,quality.dateBasis,rating.asOf,rating.F,rating.Q,rating.band]);
      if(previous&&!previous.retired){
        await db.query(`INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,actor_membership_id,rationale)
          SELECT $1,$2,COALESCE(MAX(lifecycle_version),0)+1,'supersede',$3,'New checked public batch observation' FROM evidence_source_events WHERE source_revision_id=$2`,[randomUUID(),previous.id,actor.membershipId]);
        await retireRetrievalProjection(db,"verified_research",previous.id);await enqueuePlanCleanupForSource(db,"verified_research",previous.id);
      }
      await materializeCurrentProjection(db,"verified_research",id,"internal");await materializeCurrentProjection(db,"verified_research",id,"delivery");
      revisionIds.push(id);
    }
    if(!revisionIds.length)throw new HttpFailure(422,"no_checked_evidence","No supported public evidence was retained");
    await db.query(`UPDATE customer_profile_state SET version=version+1,internal_generation=internal_generation+1,delivery_generation=delivery_generation+1,updated_at=now() WHERE customer_id=$1`,[customerId]);
    const id=randomUUID();
    await db.query(`INSERT INTO public_customer_research_results(id,environment_id,workspace_id,customer_id,actor_membership_id,batch_digest,request_key,input_digest,dossier,source_revision_ids,provider_usage,state)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,actor.membershipId,input.batchDigest,input.requestKey,digest,
      JSON.stringify({...dossier,publicIdentity:customer,formalMaturity:"unknown",internalEngagement:"not_available",sources:pages.map((page,i)=>({index:i,url:page.url,title:page.title,publishedAt:page.publishedAt,retrievedAt:page.retrievedAt}))}),revisionIds,JSON.stringify(input.usage),dossier.coverage.every(c=>c.state==="supported")?"researched":"partial"]);
    return {id,customerId,replayed:false};
  });
}
