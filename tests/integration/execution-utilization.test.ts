import {it,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {readExecutionUtilization} from "../../lib/server/execution/summary";
import {timeFixture,draftTime,submitTime,timeCandidate,decideTime} from "../fixtures/execution/time";
import {approveCalendar} from "../../lib/server/staffing/calendars";
import {reviseResource} from "../../lib/server/staffing/resources";
import {withTransaction} from "../../lib/server/db/client";

it("uses the reviewed calendar union, keeps protected time separate, and distinguishes zero, missing, and changed timezone",async()=>{
  const f=await timeFixture({linked:false});
  const entry=await submitTime(f,await draftTime(f,{minutes:180,onBehalfRationale:"Reviewer records independently verified work"},f.reviewer),f.reviewer);
  await decideTime(f,await timeCandidate(f,[entry],"time.approve",{unplanned:"Work occurred without booking",unknown_capacity:"Reviewer verifies UTC historical date",on_behalf:"Reviewer verifies subject and attribution"}));
  const scope={resourceIds:[f.resourceId],...f.period};
  expect((await readExecutionUtilization(f.reviewer,scope)).total).toMatchObject({state:"incomplete",actualBillableMinutes:"180",reasons:[{reason:"missing_calendar"}]});
  const interval=(from:string,to:string)=>({date:f.date,from:`${f.date}T${from}`,to:`${f.date}T${to}`,fromOffset:null,toOffset:null});
  const calendar={timezone:"UTC",observedAt:new Date(Date.now()-10000).toISOString(),nextReviewAt:new Date(Date.now()+86400000).toISOString(),fromDate:f.date,toDate:f.date,
    days:[{date:f.date,contracted:[interval("09:00","17:00")],holidays:[interval("12:00","13:00")],leave:[interval("12:30","14:00")],protected:[interval("15:00","16:00")]}]};
  let approval=await approveCalendar(f.reviewer,f.resourceId,{requestKey:randomUUID(),rationale:"Human verifies overlapping approved absence intervals",calendar});
  let view=await readExecutionUtilization(f.reviewer,scope);
  expect(view.total).toMatchObject({actualBillableMinutes:"180",availableMinutes:"360",percentage:"50.00",state:"complete"});
  expect(JSON.stringify(view)).not.toMatch(/PRIVATE_TIME_NOTE|holidays|protected|leave|customerId/);
  const revise=(next:unknown)=>approveCalendar(f.reviewer,f.resourceId,{requestKey:randomUUID(),revisionId:approval.revisionId,contentDigest:approval.contentDigest,
    expectedAggregateVersion:approval.aggregateVersion,rationale:"Human reviews revised date coverage",calendar:next});
  approval=await revise({...calendar,days:[{date:f.date,contracted:[],holidays:[],leave:[],protected:[]}]});
  expect((await readExecutionUtilization(f.reviewer,scope)).total).toMatchObject({actualBillableMinutes:"180",availableMinutes:"0",percentage:null,state:"not_applicable"});
  approval=await revise({...calendar,days:[{date:f.date,contracted:[interval("09:00","10:00")],holidays:[],leave:[],protected:[]}]});
  expect((await readExecutionUtilization(f.reviewer,scope)).total.percentage).toBe("300.00");
  const current=await withTransaction(async db=>(await db.query(`SELECT r.*,v.content_digest,p.display_name,p.region_code FROM workforce_resources r
    JOIN workforce_resource_revisions v ON v.id=r.current_revision_id JOIN workforce_resource_payloads p ON p.revision_id=v.id WHERE r.id=$1`,[f.resourceId])).rows[0]);
  await reviseResource(f.reviewer,f.resourceId,{requestKey:randomUUID(),revisionId:current.current_revision_id,contentDigest:current.content_digest,expectedAggregateVersion:Number(current.aggregate_version),
    rationale:"Reviewer changes the resource's current operating timezone",resource:{displayName:current.display_name,externalKey:current.external_key,kind:current.kind,membershipId:current.membership_id,
      partnerOrganizationId:current.partner_organization_id,state:"active",regionCode:current.region_code,timezone:"America/Denver"}});
  view=await readExecutionUtilization(f.reviewer,scope);
  expect(view.total).toMatchObject({actualBillableMinutes:"180",availableMinutes:null,percentage:null,state:"incomplete",reasons:[{reason:"timezone_mismatch"}]});
  const spring="2026-03-08";
  approval=await revise({...calendar,timezone:"America/Denver",fromDate:spring,toDate:spring,days:[{date:spring,
    contracted:[{date:spring,from:`${spring}T00:00`,to:`${spring}T08:00`,fromOffset:null,toOffset:null}],holidays:[],leave:[],protected:[]}]});
  expect((await readExecutionUtilization(f.reviewer,{resourceIds:[f.resourceId],from:spring,to:spring})).total).toMatchObject({availableMinutes:"420",actualBillableMinutes:"0",percentage:"0.00",state:"complete"});
},180000);
