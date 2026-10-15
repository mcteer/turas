import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import type {CurrentSession} from '../auth/sessions';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {lockWorkspaceActor,lockProfileActor} from './policy';
import {withTransaction} from '../db/client';
import {customerQuestionActor} from '../conversations/customer-accounts';
import {productsFromResearch} from '../../profiles/research-products';
import {communityAttributionWarning} from '../research/specialists/solution-research/attribution';
import {inventoryStoryJoins,inventoryStoryEligibility} from './public-inventory-reference';

export const inventorySignals=['Operational trust','Platform reuse','Delivery collaboration','Measurement and learning','Product adoption'] as const;
export const inventorySignalSchema=z.enum(inventorySignals);
export const publicInventorySearchSchema=z.object({query:z.string().trim().max(160).default(''),signal:inventorySignalSchema.optional(),offset:z.number().int().min(0).max(1000).default(0),limit:z.number().int().min(1).max(20).default(20)}).strict();
const officialUrl=z.url().refine(value=>{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='vercel.com'&&!url.username&&!url.password;});
const storySchema=z.object({url:officialUrl,title:z.string().min(1),publishedAt:z.iso.date(),scope:z.string().min(1).max(1000),
 signal:inventorySignalSchema.optional(),signals:z.array(inventorySignalSchema).min(1).optional(),products:z.array(z.string().min(1).max(200)).max(100),
 summary:z.string().min(1),cautions:z.array(z.string())}).refine(story=>!!story.signal||!!story.signals?.length);
const snapshotSchema=z.object({version:z.string().min(1).max(200),reviewedAt:z.iso.date(),directoryUrl:officialUrl,
 accounts:z.array(z.object({id:z.string(),name:z.string().min(1),aliases:z.array(z.string()),directoryListed:z.boolean(),formalMaturity:z.literal('unknown'),internalEngagement:z.literal('not_available'),evidence:z.array(storySchema).max(100)})).max(1000)});
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function ready(db:PoolClient){if(Number((await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0]?.schema_version??0)<70)throw new HttpFailure(503,'inventory_unavailable','Customer inventory release is unavailable');}

/** Explicit operator backfill of dated PUBLIC reference metadata. This creates
 * neither customer anchors nor accepted claims, grades, private context or tags
 * inferred by a new model. Every searchable story binds an already checked source. */
export async function importPublicCustomerInventory(actor:CurrentSession,raw:unknown){
 const snapshot=snapshotSchema.parse(raw);
 if(snapshot.reviewedAt>new Date().toISOString().slice(0,10))throw new HttpFailure(422,'invalid_inventory','Inventory review date is in the future');
 return withTransaction(async db=>{
  // Append-only reference metadata needs stable authority, not an exclusive
  // workspace mutex that would block unrelated profile and chat reads.
  await lockWorkspaceActor(db,actor,undefined,true);if(actor.kind!=='internal'||actor.role!=='admin')throw hiddenRecord();await ready(db);
  const customers=(await db.query<{id:string;name:string;aliases:string[];workloads:string[]}>(`SELECT c.id,c.display_name AS name,
   ARRAY(SELECT alias FROM customer_reference_aliases WHERE customer_id=c.id AND kind='name') AS aliases,
   ARRAY(SELECT alias FROM customer_reference_aliases WHERE customer_id=c.id AND kind='documented_workload'
    UNION SELECT display_name FROM customer_workloads WHERE customer_id=c.id) AS workloads
   FROM customer_references c WHERE c.workspace_id=$1 AND NOT c.synthetic ORDER BY c.id`,[actor.workspaceId])).rows;
  const sources=(await db.query<{id:string;customer_id:string;location:string}>(`SELECT v.id,v.customer_id,v.location FROM evidence_source_revisions v
   JOIN evidence_sources s ON s.id=v.source_id AND s.origin='independent_research'
   JOIN research_checks checks ON checks.source_revision_id=v.id AND checks.identity_result AND checks.scope_result AND checks.integrity_result AND checks.content_result
   WHERE v.workspace_id=$1 AND NOT EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=v.id AND e.event_type IN('withdraw','supersede'))`,[actor.workspaceId])).rows;
  let imported=0,replayed=0,unresolved=0,boundStories=0,unboundStories=0;
  const grouped=new Map<string,Array<typeof snapshot.accounts[number]>>();
  for(const account of snapshot.accounts){
   const names=[account.name,...account.aliases].map(name=>name.toLocaleLowerCase('en-US'));
   const named=customers.filter(customer=>[customer.name,...customer.aliases].some(name=>names.includes(name.toLocaleLowerCase('en-US'))));
   const matches=named.length?named:customers.filter(customer=>customer.workloads.some(name=>names.includes(name.toLocaleLowerCase('en-US'))));
   if(matches.length!==1){unresolved++;continue;}
   grouped.set(matches[0].id,[...(grouped.get(matches[0].id)??[]),account]);
  }
  for(const [customerId,accounts] of grouped){
   const evidence=accounts.flatMap(account=>account.evidence);
   const stories=evidence.flatMap(story=>{const matched=sources.filter(source=>source.customer_id===customerId&&source.location===story.url);
    if(matched.length!==1){unboundStories++;return [];}return [{sourceRevisionId:matched[0].id,title:story.title,publishedAt:story.publishedAt,summary:story.summary,cautions:story.cautions,workload:story.scope,products:story.products,signals:story.signals??[story.signal!]}];});
   boundStories+=stories.length;
   const inputDigest=digest([snapshot.version,snapshot.reviewedAt,snapshot.directoryUrl,accounts.length===1?accounts[0]:accounts,stories]);
   const id=randomUUID(),saved=await db.query(`INSERT INTO public_customer_inventory_imports
    (id,workspace_id,customer_id,reference_version,reviewed_on,directory_url,directory_listed,story_count,input_digest,imported_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(workspace_id,customer_id,input_digest) DO NOTHING RETURNING id`,
    [id,actor.workspaceId,customerId,snapshot.version,snapshot.reviewedAt,snapshot.directoryUrl,accounts.some(account=>account.directoryListed),evidence.length,inputDigest,actor.membershipId]);
   if(!saved.rowCount){replayed++;continue;}imported++;
   for(const story of stories)await db.query(`INSERT INTO public_customer_inventory_stories(id,import_id,source_revision_id,workload,products,signals,title,published_on,summary,cautions)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(import_id,source_revision_id,workload) DO NOTHING`,[randomUUID(),id,story.sourceRevisionId,story.workload,story.products,story.signals,story.title,story.publishedAt,story.summary,story.cautions]);
  }
  return {imported,replayed,unresolved,boundStories,unboundStories};
 });
}

type InventoryAccount={id:string;name:string;aliases:string[];workloads:string[];reviewed_on:Date|null;directory_listed:boolean|null;story_count:number|null;
 products?:string[];productSourceIds?:string[];stories:Array<{sourceRevisionId:string;workload:string;products:string[];signals:string[]}>};
export function filterPublicCustomerInventory(accounts:readonly InventoryAccount[],query:string,signal?:string){
 const normalized=query.trim().toLocaleLowerCase('en-US');
 return accounts.filter(account=>[account.name,...account.aliases,...account.workloads,...(account.products??[]),...account.stories.flatMap(story=>[story.workload,...story.products])]
  .some(value=>value.toLocaleLowerCase('en-US').includes(normalized))&&(!signal||account.stories.some(story=>story.signals.includes(signal))));
}
export async function listPublicCustomerInventory(db:PoolClient,principal:Parameters<typeof customerQuestionActor>[1],raw:unknown){
 const input=publicInventorySearchSchema.parse(raw);
 const scope=await customerQuestionActor(db,principal);await ready(db);
 const result=await db.query<InventoryAccount>(`SELECT c.id,c.display_name AS name,
  ARRAY(SELECT alias FROM customer_reference_aliases a WHERE a.customer_id=c.id AND a.kind='name') AS aliases,
  ARRAY(SELECT alias FROM customer_reference_aliases a WHERE a.customer_id=c.id AND a.kind='documented_workload'
   UNION SELECT w.display_name FROM customer_workloads w WHERE w.customer_id=c.id AND ($3='internal' OR EXISTS(
    SELECT 1 FROM profile_records r JOIN profile_revisions v ON v.id=r.current_accepted_revision_id WHERE r.workload_id=w.id AND v.audience='delivery' AND v.data_category='delivery_context'))) AS workloads,
  metadata.reviewed_on,metadata.directory_listed,metadata.story_count,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('sourceRevisionId',v.id,'workload',story.workload,'products',story.products,'signals',story.signals))
   ${inventoryStoryJoins} WHERE story.import_id=metadata.id AND ${inventoryStoryEligibility}), '[]'::jsonb) AS stories
  FROM customer_references c LEFT JOIN LATERAL(SELECT * FROM public_customer_inventory_imports m
   WHERE m.customer_id=c.id AND m.workspace_id=c.workspace_id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) metadata ON true
  WHERE c.workspace_id=$1 AND NOT c.synthetic AND ($3='internal' OR EXISTS(SELECT 1 FROM customer_grants g WHERE g.customer_id=c.id AND g.membership_id=$2 AND g.state='active'))
   AND ($4::uuid IS NULL OR c.id=$4) ORDER BY c.display_name,c.id LIMIT 1001`,[scope.actor.workspaceId,scope.actor.membershipId,scope.actor.kind,scope.general?null:scope.customerId]);
 if(result.rows.length>1000)throw new HttpFailure(503,'inventory_incomplete','Narrow the customer inventory');
 const research=(await db.query<{id:string;customer_id:string;title:string;passage:string;location:string;information_type:string|null}>(`SELECT v.id,v.customer_id,v.title,v.passage,v.location,v.quality_input->>'informationType' AS information_type
  FROM evidence_source_revisions v JOIN evidence_sources s ON s.id=v.source_id AND s.origin='independent_research'
  JOIN research_checks checks ON checks.source_revision_id=v.id AND checks.identity_result AND checks.scope_result AND checks.integrity_result AND checks.content_result
  WHERE v.customer_id=ANY($1::uuid[]) AND v.workspace_id=$2 AND ($3='internal' OR v.audience='delivery')
   AND NOT EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=v.id AND e.event_type IN('withdraw','supersede'))
   AND NOT EXISTS(SELECT 1 FROM evidence_conflicts conflict WHERE conflict.customer_id=v.customer_id AND conflict.workspace_id=v.workspace_id
    AND conflict.state IN('flagged','confirmed') AND v.id IN(conflict.first_revision_id,conflict.second_revision_id)) ORDER BY v.id LIMIT 5001`,[result.rows.map(account=>account.id),scope.actor.workspaceId,scope.actor.kind])).rows;
 if(research.length>5000)throw new HttpFailure(503,'inventory_incomplete','Narrow the customer evidence inventory');
 const byId=new Map(result.rows.map(account=>[account.id,account]));
 for(const source of research){
  if(source.information_type==='product_capability'||communityAttributionWarning({url:source.location}))continue;
  const products=productsFromResearch([{title:source.title,quote:source.passage}]),account=byId.get(source.customer_id)!;
  if(products.length){account.products=[...new Set([...(account.products??[]),...products])];(account.productSourceIds??=[]).push(source.id);}
 }
 const matches=filterPublicCustomerInventory(result.rows,input.query,input.signal),page=matches.slice(input.offset,input.offset+input.limit);
 for(const account of [...page].sort((a,b)=>a.id.localeCompare(b.id))){
  await lockProfileActor(db,scope.actor,account.id,undefined,true);
  if(scope.general)await db.query(`INSERT INTO general_customer_read_scopes(attempt_id,customer_id,audience,generation,citation_ids)
   SELECT $1,customer_id,$3,CASE WHEN $3='internal' THEN internal_generation ELSE delivery_generation END,$4::text[] FROM customer_profile_state WHERE customer_id=$2
   ON CONFLICT(attempt_id,customer_id) DO UPDATE SET citation_ids=ARRAY(SELECT DISTINCT unnest(general_customer_read_scopes.citation_ids||EXCLUDED.citation_ids))`,
   [scope.attemptId,account.id,scope.actor.kind==='internal'?'internal':'delivery',[...new Set([...account.stories.map(story=>story.sourceRevisionId),...(account.productSourceIds??[])])].map(id=>'attributed_research:'+id)]);
 }
 const sourceIds=[...new Set(page.flatMap(account=>[...account.stories.map(story=>story.sourceRevisionId),...(account.productSourceIds??[])]))];
 if(sourceIds.length){
  const current=await db.query(`SELECT v.id FROM evidence_source_revisions v JOIN research_checks checks ON checks.source_revision_id=v.id
   WHERE v.id=ANY($1::uuid[]) AND v.workspace_id=$2 AND ($3='internal' OR v.audience='delivery')
    AND checks.identity_result AND checks.scope_result AND checks.integrity_result AND checks.content_result
    AND NOT EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=v.id AND e.event_type IN('withdraw','supersede'))
    AND NOT EXISTS(SELECT 1 FROM evidence_conflicts conflict WHERE conflict.customer_id=v.customer_id AND conflict.workspace_id=v.workspace_id
     AND conflict.state IN('flagged','confirmed') AND v.id IN(conflict.first_revision_id,conflict.second_revision_id))`,[sourceIds,scope.actor.workspaceId,scope.actor.kind]);
  if(current.rowCount!==sourceIds.length)throw new HttpFailure(409,'inventory_changed','Customer evidence changed; repeat the inventory read');
 }
 const dates=result.rows.flatMap(account=>account.reviewed_on?[account.reviewed_on.toISOString().slice(0,10)]:[]).sort();
 return {dataVersion:'canonical-public-inventory-v1',reviewedAt:dates.at(-1)??null,
  coverage:`${result.rows.length} authorized customers; ${result.rows.filter(account=>account.reviewed_on).length} have dated public inventory metadata.`,
  limitations:'Dated public case-study signals describe only their cited workloads. They are not formal maturity grades, current CRM status, risk, engagement or commercial facts. Missing metadata is unknown. Withdrawn, superseded or conflicted stories do not match signal/product filters. Read get_customer_evidence before making claims.',
  total:matches.length,nextOffset:input.offset+input.limit<matches.length?input.offset+input.limit:null,
  accounts:page.map(account=>({id:account.id,name:account.name,storyCount:account.story_count,directoryListed:account.directory_listed,formalMaturity:'unknown' as const}))};
}
