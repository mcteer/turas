import { z } from "zod";
import { partnerPageQuery,partnerContractVersion } from "../../contracts/partners";
import { hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { listDeliveryEngagementPage } from "../engagements/read";
import { partnerRead } from "./commands";
import type { PartnerActor } from "./policy";
import { partnerAuthorityDigest,readPartnerCursor,issuePartnerCursor } from "./cursors";
import { partnerHash } from "./repository";
import { partnerCustomerCard,partnerEngagementCard } from "./projection";
export async function readPartnerWorkspace(actor:PartnerActor,input:unknown={}){
 const query=partnerPageQuery.parse(input);
 return partnerRead(actor,undefined,async db=>{
  const scope=partnerHash({kind:"workspace",workspaceId:actor.workspaceId,limit:query.limit,search:query.search}),authority=await partnerAuthorityDigest(db,actor),after=await readPartnerCursor(db,actor,query.cursor,scope,authority);
  const rows=(await db.query<{id:string;display_name:string}>(`SELECT c.id,c.display_name FROM customer_references c
   WHERE c.workspace_id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM customer_grants g WHERE g.customer_id=c.id AND g.membership_id=$3 AND g.state='active'))
   AND ($4='' OR strpos(lower(c.display_name),lower($4))>0) AND ($5::uuid IS NULL OR c.id>$5::uuid) ORDER BY c.id LIMIT $6`,[actor.workspaceId,actor.kind==="internal",actor.membershipId,query.search,after?.id??null,query.limit+1])).rows;
  const hasMore=rows.length>query.limit,items=rows.slice(0,query.limit),nextCursor=hasMore?await issuePartnerCursor(db,actor,scope,authority,{id:items.at(-1)!.id}):null;
  return {contractVersion:partnerContractVersion,items:items.map(partnerCustomerCard),hasMore,nextCursor,sharedKnowledgeHref:"/knowledge"};
 });
}
export async function readPartnerEngagements(actor:PartnerActor,customerId:string,input:unknown={}){
 if(!z.uuid().safeParse(customerId).success)throw hiddenRecord();
 const query=partnerPageQuery.extend({workloadId:z.uuid().optional()}).parse(input);
 return partnerRead(actor,customerId,async db=>{
  const customer=(await db.query("SELECT display_name FROM customer_references WHERE id=$1 AND workspace_id=$2",[customerId,actor.workspaceId])).rows[0];
  const scope=partnerHash({kind:"engagements",customerId,limit:query.limit,search:query.search,workloadId:query.workloadId??null}),authority=await partnerAuthorityDigest(db,actor,customerId),after=await readPartnerCursor(db,actor,query.cursor,scope,authority);
  const page=await listDeliveryEngagementPage(db,actor,customerId,{limit:query.limit,search:query.search,workloadId:query.workloadId??null,after});
  const nextCursor=page.hasMore&&page.lastKey?await issuePartnerCursor(db,actor,scope,authority,page.lastKey):null;
  return {contractVersion:partnerContractVersion,customerId,displayName:customer.display_name,items:page.items.map(partnerEngagementCard),hasMore:page.hasMore,nextCursor,sharedKnowledgeHref:"/knowledge"};
 });
}
