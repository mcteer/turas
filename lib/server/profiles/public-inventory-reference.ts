import type {PoolClient} from 'pg';
import type {CurrentReadActor} from '../auth/read-actor';
import {lockProfileActor} from './policy';
import {productsFromResearch} from '../../profiles/research-products';

/** Shared lifecycle fence for dated curated labels. A checked successor may
 * retain them only when every original supporting quote was preserved. */
export const inventoryStoryJoins=`FROM public_customer_inventory_stories story
 JOIN evidence_source_revisions original ON original.id=story.source_revision_id AND original.customer_id=c.id AND original.workspace_id=c.workspace_id
 JOIN evidence_sources original_source ON original_source.id=original.source_id AND original_source.origin='independent_research'
 JOIN evidence_source_revisions v ON v.source_id=original.source_id AND v.version=(SELECT max(head.version) FROM evidence_source_revisions head WHERE head.source_id=original.source_id)
 JOIN research_checks checks ON checks.source_revision_id=v.id AND checks.identity_result AND checks.scope_result AND checks.integrity_result AND checks.content_result`;
export const inventoryStoryEligibility=`($3='internal' OR v.audience='delivery')
 AND NOT EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=v.id AND e.event_type IN('withdraw','supersede'))
 AND NOT EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=original.id AND e.event_type='withdraw')
 AND (v.id=original.id OR (strpos(checks.rationale,'"retainedPreviousClaim":true')>0 AND NOT EXISTS(
  SELECT 1 FROM regexp_split_to_table(original.passage,E'\n[[:space:]]*\n') quote WHERE length(btrim(quote))>0 AND strpos(v.passage,btrim(quote))=0)))
 AND NOT EXISTS(SELECT 1 FROM evidence_conflicts conflict WHERE conflict.customer_id=c.id AND conflict.workspace_id=c.workspace_id
  AND conflict.state IN('flagged','confirmed') AND (v.id IN(conflict.first_revision_id,conflict.second_revision_id) OR original.id IN(conflict.first_revision_id,conflict.second_revision_id)))`;

export async function readPublicInventoryReference(db:PoolClient,actor:CurrentReadActor,customerId:string){
 const schema=Number((await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0]?.schema_version??0);
 if(schema<70)return null;
 await lockProfileActor(db,actor,customerId,undefined,true);
 const metadata=(await db.query(`SELECT * FROM public_customer_inventory_imports WHERE workspace_id=$1 AND customer_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1`,[actor.workspaceId,customerId])).rows[0];
 if(!metadata)return null;
 const rows=(await db.query(`SELECT story.title,story.published_on,story.workload,story.products,story.signals,story.summary,story.cautions,
  v.id AS source_revision_id,original.id AS reference_source_revision_id,v.location,v.retrieval_at
  FROM customer_references c JOIN public_customer_inventory_stories story ON story.import_id=$4
  JOIN evidence_source_revisions original ON original.id=story.source_revision_id AND original.customer_id=c.id AND original.workspace_id=c.workspace_id
  JOIN evidence_sources original_source ON original_source.id=original.source_id AND original_source.origin='independent_research'
  JOIN evidence_source_revisions v ON v.source_id=original.source_id AND v.version=(SELECT max(head.version) FROM evidence_source_revisions head WHERE head.source_id=original.source_id)
  JOIN research_checks checks ON checks.source_revision_id=v.id AND checks.identity_result AND checks.scope_result AND checks.integrity_result AND checks.content_result
  WHERE c.workspace_id=$1 AND c.id=$2 AND ${inventoryStoryEligibility} ORDER BY story.id LIMIT 100`,[actor.workspaceId,customerId,actor.kind,metadata.id])).rows;
 const date=(value:Date|string)=>value instanceof Date?value.toISOString().slice(0,10):value;
 return {dataVersion:String(metadata.reference_version),reviewedAt:date(metadata.reviewed_on),directoryListed:Boolean(metadata.directory_listed),
  formalMaturity:'unknown' as const,internalEngagement:'not_available' as const,
  limitations:'Dated public inventory metadata, not a formal maturity assessment or current internal account status. Source lifecycle and current access are checked separately.',
  evidence:rows.map(row=>({sourceRevisionId:String(row.source_revision_id),referenceSourceRevisionId:String(row.reference_source_revision_id),url:String(row.location),title:String(row.title),publishedAt:date(row.published_on),scope:String(row.workload),
   products:row.products as string[],signals:row.signals as string[],summary:String(row.summary),cautions:row.cautions as string[],retrievalAt:(row.retrieval_at as Date).toISOString()}))};
}

export function curatedProductNames(products:readonly string[]){
 return [...new Set(products.flatMap(product=>{const canonical=productsFromResearch([{title:'',quote:product}]);return canonical.length?canonical:[product];}))];
}
