import {withTransaction} from "../../lib/server/db/client";
import {createProfileTestSession} from "../fixtures/profiles";
import {describe,it,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {executionRecordSchema} from "../../lib/server/execution/schema";
import {registerBase,registerFixture,saveRegister,submitRegister,reviewRegister} from "../fixtures/execution/registers";
import {handoffRecord,outcomeRecord} from "../fixtures/execution/handoff";

describe("strict effort and delivery record contract",()=>{
  it("accepts exact bounded point minutes and explicit zero estimates, without inferring a point from a range",()=>{
    const budget={...registerBase(),kind:"effort_budget",workPackageKey:"proof",minutes:0};
    expect(executionRecordSchema.safeParse(budget).success).toBe(true);
    expect(executionRecordSchema.safeParse({...budget,minutes:6000000}).success).toBe(true);
    for(const minutes of [-1,6000001,1.5,"60"])expect(executionRecordSchema.safeParse({...budget,minutes}).success).toBe(false);
    expect(executionRecordSchema.safeParse({...budget,workPackageKey:null}).success).toBe(false);
    expect(executionRecordSchema.safeParse({...budget,minHours:1,maxHours:2}).success).toBe(false);
    const estimate={...budget,kind:"estimate",asOf:new Date().toISOString(),explicitZero:true};
    expect(executionRecordSchema.safeParse(estimate).success).toBe(true);
    expect(executionRecordSchema.safeParse({...estimate,explicitZero:false}).success).toBe(false);
  });
  it("binds deliverables and acknowledgement to exact evidence and preserves outcome unknowns",()=>{
    const ref={id:randomUUID(),kind:"execution_record" as const,sourceRevisionId:randomUUID(),generation:1,contentDigest:"a".repeat(64)},handoff=handoffRecord(ref);
    expect(executionRecordSchema.safeParse(handoff).success).toBe(true);
    expect(executionRecordSchema.safeParse({...handoff,deliverables:[]}).success).toBe(false);
    expect(executionRecordSchema.safeParse({...handoff,deliverables:Array.from({length:51},(_,i)=>({milestoneKey:`key_${i}`,evidenceReferenceId:ref.id}))}).success).toBe(false);
    expect(executionRecordSchema.safeParse({...handoff,acknowledgement:{state:"recorded",eventDate:handoff.eventDate,evidenceReferenceIds:[]}}).success).toBe(false);
    const outcome=outcomeRecord();expect(executionRecordSchema.safeParse(outcome).success).toBe(true);
    expect(executionRecordSchema.safeParse({...outcome,currentValue:"1"}).success).toBe(false);
    const observed={...outcome,status:"observed",measure:"Request latency",unit:"ms",currentValue:"-1.123456",baselineUnknownReason:"No prior comparable measurement",comparisonUnknownReason:"No control group",measurementStart:outcome.eventDate,measurementEnd:outcome.eventDate,references:[ref],limitationReason:null};
    expect(executionRecordSchema.safeParse(observed).success).toBe(true);
    for(const patch of [{currentValue:"1.1234567"},{currentValue:"1000000000000"},{currentValue:"1e3"},{baselineUnknownReason:null},{references:[]},{measurementStart:"2026-12-31",measurementEnd:"2026-01-01"}])expect(executionRecordSchema.safeParse({...observed,...patch}).success).toBe(false);
  });
  it("rejects future estimates and partner authoring, and installs only a reviewed exact effort head",async()=>{
    const f=await registerFixture(),content={...registerBase(),kind:"effort_budget",workPackageKey:"proof",minutes:120};
    await expect(saveRegister(f,content,undefined,await withTransaction(db=>createProfileTestSession(db,"partner")))).rejects.toMatchObject({status:403});
    await expect(saveRegister(f,{...content,kind:"estimate",asOf:new Date(Date.now()+86400000).toISOString(),explicitZero:false})).rejects.toMatchObject({status:422});
    const draft=await saveRegister(f,content);const submitted=await submitRegister(f,draft);await reviewRegister(f,submitted);
    await withTransaction(async db=>expect((await db.query("SELECT revision_id,kind FROM execution_effort_heads WHERE engagement_id=$1",[f.engagementId])).rows).toEqual([{revision_id:submitted.revisionId,kind:"effort_budget"}]));
    const replacement=await submitRegister(f,await saveRegister(f,{...content,minutes:100}));await reviewRegister(f,replacement);
    await withTransaction(async db=>{expect((await db.query("SELECT revision_id FROM execution_effort_heads WHERE engagement_id=$1",[f.engagementId])).rows).toEqual([{revision_id:replacement.revisionId}]);expect((await db.query("SELECT accepted_revision_id FROM execution_records WHERE id=$1",[draft.id])).rows[0].accepted_revision_id).toBeNull();});
  });
});
