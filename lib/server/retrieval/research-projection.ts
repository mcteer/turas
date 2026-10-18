import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
export type VerifiedResearchProjectionRow={id:string;workspace_id:string;customer_id:string;version:string;location:string;text:string;documentProjection:boolean};
/** Canonical verified-research projection eligibility, without allocating chunks.
 * Callers authorize their scope first; the projection builder also uses these
 * exact rows before constructing its retrieval passages. */
export async function readVerifiedResearchProjectionRows(client:PoolClient,revisionIds:readonly string[],audience:'internal'|'delivery',environmentId:string){
 const result=new Map<string,VerifiedResearchProjectionRow>();
 if(!revisionIds.length)return result;
 const schema=(await client.query('SELECT schema_version FROM turas_environment WHERE environment_id=$1',[environmentId])).rows[0]?.schema_version??0;
 const documents=schema>=60;
 const rows=(await client.query<{id:string;workspace_id:string;customer_id:string;version:string;passage:string;location:string;audience:string;document_id:string|null;document_text:string|null;document_digest:string|null}>(`
  SELECT v.id,v.workspace_id,v.customer_id,v.version,v.passage,v.location,v.audience,
   ${documents?'document.source_revision_id AS document_id,document.document_text,document.document_digest':'NULL::uuid AS document_id,NULL::text AS document_text,NULL::text AS document_digest'}
  FROM evidence_source_revisions v JOIN evidence_sources s ON s.id=v.source_id AND s.origin='independent_research'
  JOIN research_checks c ON c.source_revision_id=v.id AND c.identity_result AND c.scope_result AND c.integrity_result AND c.content_result
  ${documents?'LEFT JOIN independent_research_documents document ON document.source_revision_id=v.id':''}
  WHERE v.id=ANY($1::uuid[]) AND NOT EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=v.id AND e.event_type IN('withdraw','supersede'))`,[revisionIds])).rows;
 for(const row of rows){
  if(audience==='delivery'&&row.audience!=='delivery')continue;
  const url=new URL(row.location);if(url.protocol!=='https:'||url.username||url.password)continue;
  let text=row.passage,documentProjection=false;
  if(row.document_id){
   if(createHash('sha256').update(row.document_text!).digest('hex')!==row.document_digest)continue;
   text=row.document_text!;documentProjection=true;
  }
  if(!text.trim())continue;
  result.set(row.id,{id:row.id,workspace_id:row.workspace_id,customer_id:row.customer_id,version:row.version,location:row.location,text,documentProjection});
 }
 return result;
}
