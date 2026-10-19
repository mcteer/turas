import { checkPilotReadiness } from "../../../scripts/pilot-readiness";
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { parsePilotRun, pilotReceiptSchema, pilotRunSchema, verifyPilotProof } from "../../../lib/contracts/pilot-readiness";
function fixture() {
 const runId=randomUUID(), attemptId=randomUUID(), id=randomUUID();
 const binding={environmentMarker:randomUUID(),sourceCommit:"a".repeat(40),sourceDigest:"b".repeat(64),catalogDigest:"c".repeat(64),scopeDigest:"d".repeat(64)};
 const receipt={version:"pilot-readiness-v1" as const,id,runId,attemptId,gateId:"G01",method:"local" as const,role:"operator" as const,workspaceId:randomUUID(),...binding,startedAt:"2026-10-10T00:00:00Z",completedAt:"2026-10-10T00:01:00Z",state:"pass" as const,expectedCases:1,passedCases:1,failedCases:0,skippedCases:0,flakyCases:0,proofDigest:"e".repeat(64)};
 return {version:"pilot-readiness-v1" as const,id:runId,createdAt:receipt.startedAt,...binding,attempts:[{id:attemptId,gateId:"G01",complete:true as const,receiptIds:[id]}],selectedAttempts:[{gateId:"G01",attemptId}],receipts:[receipt]};
}
describe("pilot evidence attribution",()=>{
 it("accepts an attributed partial run without claiming eligibility",()=>expect(pilotRunSchema.parse(fixture()).selectedAttempts).toHaveLength(1));
 it("rejects unknown fields including claimed owner approval",()=>expect(pilotRunSchema.safeParse({...fixture(),actor:"mcteer",approved:true}).success).toBe(false));
 it("rejects duplicate selected gates",()=>{const r=fixture();r.selectedAttempts.push(r.selectedAttempts[0]);expect(pilotRunSchema.safeParse(r).success).toBe(false);});
 it("rejects foreign run receipts",()=>{const r=fixture();r.receipts[0].runId=randomUUID();expect(pilotRunSchema.safeParse(r).success).toBe(false);});
 it("rejects different source",()=>{const r=fixture();r.receipts[0].sourceDigest="f".repeat(64);expect(pilotRunSchema.safeParse(r).success).toBe(false);});
 it("rejects different environment",()=>{const r=fixture();r.receipts[0].environmentMarker=randomUUID();expect(pilotRunSchema.safeParse(r).success).toBe(false);});
 it("rejects incomplete inventories",()=>{const r=fixture();r.receipts[0].expectedCases=2;expect(pilotRunSchema.safeParse(r).success).toBe(false);});
 it("rejects unstable passes",()=>{const r=fixture();r.receipts[0].flakyCases=1;expect(pilotRunSchema.safeParse(r).success).toBe(false);});
 it("rejects unknown gates",()=>expect(pilotReceiptSchema.safeParse({...fixture().receipts[0],gateId:"G99"}).success).toBe(false));
 it("requires hosted identity",()=>{for(const method of ["hosted","automated-role-exercise"])expect(pilotReceiptSchema.safeParse({...fixture().receipts[0],method}).success).toBe(false);});
 it("rejects unsafe hosted origins",()=>{const r=fixture().receipts[0];expect(pilotReceiptSchema.safeParse({...r,method:"hosted",hosted:{deploymentId:"deployment",commit:r.sourceCommit,origin:"https://user:password@example.com/path",environmentMarker:r.environmentMarker,schemaLedgerDigest:"a".repeat(64),runtimeGrantsVerified:true}}).success).toBe(false);});
 it("limits metadata before parsing",()=>expect(()=>parsePilotRun(" ".repeat(1024*1024+1))).toThrow("exceeds limit"));
});

describe("readiness selection and freshness",()=>{
 it("missing gates remain ineligible",()=>{const result=checkPilotReadiness(pilotRunSchema.parse(fixture()),Date.parse("2026-10-10T01:00:00Z"));expect(result.technicalEligibility).toBe("ineligible");expect(result.releaseApproved).toBe(false);expect(result.gates[1].state).toBe("unverified");});
 it("selected failures are preserved",()=>{const r=fixture();const receipt={...r.receipts[0],state:"fail",passedCases:0,failedCases:1};const run=pilotRunSchema.parse({...r,receipts:[receipt]});expect(checkPilotReadiness(run).gates[0].state).toBe("fail");});
 it("future proof does not pass",()=>expect(checkPilotReadiness(pilotRunSchema.parse(fixture()),Date.parse("2026-10-09T00:00:00Z")).gates[0].state).toBe("unverified"));
});

it("stale hosted proof remains unverified",()=>{const r=fixture();r.attempts[0].gateId="G01";const receipt=r.receipts[0];const hosted={...receipt,method:"hosted",hosted:{deploymentId:"deployment",commit:r.sourceCommit,origin:"https://example.com",environmentMarker:r.environmentMarker,schemaLedgerDigest:"a".repeat(64),runtimeGrantsVerified:true}};const local={...receipt,id:randomUUID()};r.attempts[0].receiptIds.push(local.id);const run=pilotRunSchema.parse({...r,receipts:[hosted,local]});expect(checkPilotReadiness(run,Date.parse("2026-10-12T00:00:00Z")).gates[0].state).toBe("unverified");});
it("a different method cannot replace required local proof",()=>{const r=fixture();expect(checkPilotReadiness(pilotRunSchema.parse({...r,receipts:[{...r.receipts[0],method:"ci"}]}),Date.parse("2026-10-10T01:00:00Z")).gates[0].state).toBe("unverified");});
it("selecting an old pass cannot hide a later failed attempt",()=>{const r=fixture();const attemptId=randomUUID(),id=randomUUID();const failure={...r.receipts[0],id,attemptId,state:"fail",passedCases:0,failedCases:1};const run=pilotRunSchema.parse({...r,attempts:[...r.attempts,{id:attemptId,gateId:"G01",complete:true,receiptIds:[id]}],receipts:[...r.receipts,failure]});expect(checkPilotReadiness(run,Date.parse("2026-10-10T01:00:00Z")).gates[0].state).toBe("unverified");});

function proofFixture(){const receipt=fixture().receipts[0];const {id,proofDigest,expectedCases,passedCases,failedCases,skippedCases,flakyCases,hosted,...attribution}=receipt as typeof receipt & {hosted?:unknown};return {receipt,proof:{...attribution,version:"pilot-proof-v1",receiptId:id,cases:[{id:"case-001",state:"pass",flaky:false}]}};}
it("validates exact proof attribution and case counts",()=>{const {receipt,proof}=proofFixture();expect(verifyPilotProof(pilotReceiptSchema.parse(receipt),proof).cases).toHaveLength(1);});
it("rejects a proof from another role",()=>{const {receipt,proof}=proofFixture();expect(()=>verifyPilotProof(pilotReceiptSchema.parse(receipt),{...proof,role:"assigned-partner"})).toThrow("attribution mismatch");});
it("rejects duplicate proof case identities",()=>{const {receipt,proof}=proofFixture();expect(()=>verifyPilotProof(pilotReceiptSchema.parse(receipt),{...proof,cases:[...proof.cases,...proof.cases]})).toThrow();});
it("rejects proof counts that disagree with the receipt",()=>{const {receipt,proof}=proofFixture();expect(()=>verifyPilotProof(pilotReceiptSchema.parse(receipt),{...proof,cases:[{id:"case-001",state:"fail",flaky:false}]})).toThrow("inventory mismatch");});
