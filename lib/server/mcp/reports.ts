import { createHash,randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { McpReadActor } from '../auth/read-actor';
import { mcpToolInputs,mcpReportSchema,mcpContractVersion } from '../../contracts/mcp';
import { readCurrentPublishedReport } from '../reports/read';
import { createMcpHandle,resolveMcpHandle } from './handles';
import { requireMcpScope } from './policy';
import { unavailableMcp } from './projections';
const filterDigest=createHash('sha256').update('published-reports-v1').digest('hex');
const envelope=<T>(data:T,status:'available'|'empty'='available',nextCursor:string|null=null)=>({contractVersion:mcpContractVersion,status,requestId:randomUUID(),data,nextCursor});
export async function readMcpReport(db:PoolClient,actor:McpReadActor,raw:unknown){
 const input=mcpToolInputs.turas_report_read_v1.parse(raw);await requireMcpScope(db,actor,'reports',input.customerId);
 const current=await readCurrentPublishedReport(db,actor,input.customerId,input.reportId);
 if(!current)return unavailableMcp('not_found');
 if(input.expectedRevisionId&&input.expectedRevisionId!==current.published.revision_id)return unavailableMcp('source_changed');
 const {published,fence,document}=current;
 const {ownerLabel,sponsorLabel,metrics,...publicDocument}=document;
 return envelope(mcpReportSchema.parse({reportId:input.reportId,publicationId:published.id,customerId:input.customerId,
   revisionId:published.revision_id,generation:Number(published.publication_number),digest:fence.content_digest,state:'published',dependencyState:'current',
   document:{...publicDocument,asOf:new Date(document.asOf).toISOString(),sections:document.sections.filter(section=>section.heading!=='Effort and Capacity'),
     correctionOf:published.correction_of??null}}));
}
export async function listMcpReports(db:PoolClient,actor:McpReadActor,raw:unknown){
 const input=mcpToolInputs.turas_reports_list_v1.parse(raw);await requireMcpScope(db,actor,'reports',input.customerId);
 const cursor=input.cursor?await resolveMcpHandle(db,actor,input.cursor,{kind:'cursor',category:'reports',customerId:input.customerId,section:'reports',filterDigest}):undefined;
 const snapshot=(await db.query<{digest:string}>(`SELECT encode(sha256(convert_to(coalesce(string_agg(concat_ws(':',s.id,p.id,p.revision_id,st.generation,st.visibility,st.state),
   '|' ORDER BY s.id,p.publication_number),''),'UTF8')),'hex') AS digest FROM report_scopes s JOIN report_publications p ON p.report_id=s.id
   JOIN report_revision_states st ON st.revision_id=p.revision_id WHERE s.environment_id=$1 AND s.workspace_id=$2 AND s.customer_id=$3
     AND (s.audience='delivery' OR $4='internal')`,[actor.environmentId,actor.workspaceId,input.customerId,actor.kind])).rows[0].digest;
 if(cursor&&cursor.contentDigest!==snapshot)return unavailableMcp('source_changed');
 const candidates=(await db.query<{id:string}>(`SELECT s.id FROM report_scopes s WHERE s.environment_id=$1 AND s.workspace_id=$2 AND s.customer_id=$3
   AND (s.audience='delivery' OR $4='internal') AND EXISTS(SELECT 1 FROM report_publications p WHERE p.report_id=s.id)
   AND ($5::uuid IS NULL OR s.id>$5) ORDER BY s.id LIMIT 101`,[actor.environmentId,actor.workspaceId,input.customerId,actor.kind,cursor?.positionId??null])).rows;
 const items=[];let last:string|undefined,more=false;
 for(const row of candidates.slice(0,100)){
  const result=await readMcpReport(db,actor,{customerId:input.customerId,reportId:row.id});
  if(result.status==='available'&&result.data){if(items.length===input.limit){more=true;break;}
   const data=result.data;items.push({reportId:data.reportId,publicationId:data.publicationId,revisionId:data.revisionId,generation:data.generation,digest:data.digest,
     title:data.document.title,audience:data.document.audience,correctionOf:data.document.correctionOf});}
  last=row.id;
 }
 if(candidates.length>100&&!more)return unavailableMcp('incomplete');
 const nextCursor=more&&last?await createMcpHandle(db,actor,{kind:'cursor',category:'reports',customerId:input.customerId,section:'reports',filterDigest,
   positionId:last,contentDigest:snapshot}):null;
 return envelope({items},items.length?'available':'empty',nextCursor);
}
