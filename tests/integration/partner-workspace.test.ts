import { describe,it,expect } from "vitest";
import { randomUUID } from "node:crypto";
import { withPartnerDatabase } from "../fixtures/partners/environment";
import { partnerTestActors,partnerAdditionalMember,partnerDeliveryBaseline } from "../fixtures/partners/seed";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { readPartnerWorkspace,readPartnerEngagements } from "../../lib/server/partners/workspace";

describe("partner workspace discovery",()=>{
 it("pages more than fifty accepted delivery engagements and searches only released titles",async()=>withPartnerDatabase(async db=>{
  const {reviewer,author,partner}=await partnerTestActors(db),ids:string[]=[];
  await db.query("BEGIN");try{for(let n=0;n<52;n++)ids.push((await partnerDeliveryBaseline(db,author,reviewer,DEMO_IDS.sharedCustomer,`Synthetic paged delivery ${n}`)).engagementId);await db.query("COMMIT");}catch(error){await db.query("ROLLBACK");throw error;}
  let cursor:string|undefined;const found:string[]=[];
  do{const page=await readPartnerEngagements(partner,DEMO_IDS.sharedCustomer,{limit:20,search:"Synthetic paged delivery",cursor});found.push(...page.items.map(item=>item.engagementId));cursor=page.nextCursor??undefined;expect(page).not.toHaveProperty("total");}while(cursor);
  expect(found.sort()).toEqual(ids.sort());
 }));
 it("pages more than fifty granted customers without exposing hidden names or totals",async()=>withPartnerDatabase(async db=>{
  const actor=await partnerAdditionalMember(db,null),ids:string[]=[];
  for(let n=0;n<55;n++){const id=randomUUID();ids.push(id);await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,$3,true)",[id,actor.workspaceId,`Synthetic Delivery ${n}`]);await db.query("INSERT INTO customer_grants(id,membership_id,workspace_id,customer_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),actor.membershipId,actor.workspaceId,id,DEMO_IDS.mcteer]);}
  let cursor:string|undefined;const found:string[]=[];
  do{const page=await readPartnerWorkspace(actor,{limit:20,search:"",cursor});expect(page).not.toHaveProperty("total");expect(JSON.stringify(page)).not.toContain("Birch");found.push(...page.items.map(item=>item.customerId));cursor=page.nextCursor??undefined;expect(page.hasMore).toBe(Boolean(cursor));}while(cursor);
  expect(found.sort()).toEqual(ids.sort());expect(new Set(found).size).toBe(55);
 }));
 it("binds cursors to member, filter, page size and monotonic current authority",async()=>withPartnerDatabase(async db=>{
  const {reviewer}=await partnerTestActors(db),other=await partnerAdditionalMember(db),page=await readPartnerWorkspace(reviewer,{limit:1,search:""});expect(page.nextCursor).not.toBeNull();
  for(const [actor,query] of [[other,{limit:1,search:""}],[reviewer,{limit:2,search:""}],[reviewer,{limit:1,search:"changed"}]] as const)await expect(readPartnerWorkspace(actor,{...query,cursor:page.nextCursor!})).rejects.toMatchObject({status:409});
  await db.query("UPDATE memberships SET active=false WHERE id=$1",[reviewer.membershipId]);await db.query("UPDATE memberships SET active=true WHERE id=$1",[reviewer.membershipId]);
  await expect(readPartnerWorkspace(reviewer,{limit:1,search:"",cursor:page.nextCursor!})).rejects.toMatchObject({status:409});
 }));
 it("expires cursors and limits live cursor identities to one hundred",async()=>withPartnerDatabase(async db=>{
  const {reviewer}=await partnerTestActors(db),page=await readPartnerWorkspace(reviewer,{limit:1,search:""});await db.query("UPDATE partner_list_cursors SET expires_at=now()-interval '1 second' WHERE id=$1",[page.nextCursor]);
  await expect(readPartnerWorkspace(reviewer,{limit:1,search:"",cursor:page.nextCursor!})).rejects.toMatchObject({status:409});
  // Exercise the storage bound directly; production admission still enforces its read quota.
  const { issuePartnerCursor }=await import("../../lib/server/partners/cursors");for(let i=0;i<105;i++)await issuePartnerCursor(db,reviewer,"a".repeat(64),"b".repeat(64),{id:randomUUID()});
  expect(Number((await db.query("SELECT count(*) FROM partner_list_cursors WHERE actor_membership_id=$1",[reviewer.membershipId])).rows[0].count)).toBe(100);
 }));
 it("keeps shared knowledge usable with no grants and hides inaccessible engagement scopes",async()=>withPartnerDatabase(async db=>{
  const actor=await partnerAdditionalMember(db,null),page=await readPartnerWorkspace(actor,{limit:20,search:""});expect(page.items).toEqual([]);expect(page.sharedKnowledgeHref).toBe("/knowledge");
  await expect(readPartnerEngagements(actor,DEMO_IDS.sharedCustomer,{limit:20,search:""})).rejects.toMatchObject({status:404});
 }));
});
