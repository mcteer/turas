import { afterEach,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { chmod,mkdtemp,realpath,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendPilotAttempt,readEvidence,writeEvidence } from "../../../scripts/pilot-evidence";
import { pilotSource } from "../../../scripts/pilot-source";
import { pilotRunSchema } from "../../../lib/contracts/pilot-readiness";
const roots:string[]=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function fixture(){
 const root=await mkdtemp(path.join(await realpath(tmpdir()),"pilot-resume-"));await chmod(root,0o700);roots.push(root);
 const source=await pilotSource(),runId=randomUUID(),environmentMarker="test-pilot-resume",workspaceId=randomUUID(),scopeDigest="a".repeat(64);
 async function attempt(state:"pass"|"fail"){
  const id=randomUUID(),receiptId=randomUUID();const proof={version:"pilot-proof-v1",receiptId,runId,attemptId:id,gateId:"G01",method:"local",role:"operator",workspaceId,environmentMarker,...source,scopeDigest,startedAt:"2026-10-10T00:00:00Z",completedAt:"2026-10-10T00:01:00Z",state,cases:[{id:"synthetic-resume-case",state,flaky:false}]};
  const proofDigest=await writeEvidence(root,`${receiptId}.json`,proof);
  const {cases,receiptId:ignored,...binding}=proof;
  const receipt={...binding,version:"pilot-readiness-v1",id:receiptId,proofDigest,expectedCases:1,passedCases:state==="pass"?1:0,failedCases:state==="fail"?1:0,skippedCases:0,flakyCases:0};
  return {attempt:{id,gateId:"G01",complete:true,receiptIds:[receiptId]},receipt};
 }
 const prior=await attempt("fail"),next=await attempt("pass");
 const run={version:"pilot-readiness-v1",id:runId,createdAt:"2026-10-10T00:00:00Z",environmentMarker,...source,scopeDigest,attempts:[prior.attempt],receipts:[prior.receipt],selectedAttempts:[{gateId:"G01",attemptId:prior.attempt.id}]};
 const digest=await writeEvidence(root,"prior.json",run);return {root,run,digest,prior,next};
}
it("preserves failed attempts when selecting a complete later rerun",async()=>{const f=await fixture();const digest=await appendPilotAttempt(f.root,"prior.json",f.digest,"next.json",f.next.attempt,[f.next.receipt]);const next=pilotRunSchema.parse(await readEvidence(f.root,"next.json",digest));expect(next.attempts).toHaveLength(2);expect(next.receipts[0].state).toBe("fail");expect(next.selectedAttempts[0].attemptId).toBe(f.next.attempt.id);expect(await readEvidence(f.root,"prior.json",f.digest)).toEqual(f.run);});
it("refuses resume after prior proof bytes change",async()=>{const f=await fixture();await writeFile(path.join(f.root,`${f.prior.receipt.id}.json`),"{}\n");await expect(appendPilotAttempt(f.root,"prior.json",f.digest,"next.json",f.next.attempt,[f.next.receipt])).rejects.toThrow("integrity failure");});
it("refuses a partial replacement attempt",async()=>{const f=await fixture();await expect(appendPilotAttempt(f.root,"prior.json",f.digest,"next.json",{...f.next.attempt,receiptIds:[...f.next.attempt.receiptIds,randomUUID()]},[f.next.receipt])).rejects.toThrow("complete new execution");});
