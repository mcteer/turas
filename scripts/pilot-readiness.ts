import { fileURLToPath } from "node:url";
import path from "node:path";
import { parsePilotRun, verifyPilotProof, type PilotRun, pilotGateVerificationSchema,type PilotGateVerification } from "../lib/contracts/pilot-readiness";
import { readEvidence } from "./pilot-evidence";
import { pilotSource } from "./pilot-source";
import { pilotCatalog as catalog } from "./pilot-catalog";

export function checkPilotReadiness(run: PilotRun, now = Date.now(), observations:readonly PilotGateVerification[] = []) {
  const gates: { id: string; state: "pass" | "fail" | "blocked" | "unverified" }[] = [];
  for (const gate of catalog.gates) {
    const selected = run.selectedAttempts.find(s => s.gateId === gate.id);
    const attempt = run.attempts.find(a => a.id === selected?.attemptId);
    let state: typeof gates[number]["state"] = "unverified";
    if (attempt) {
      const latest=run.attempts.filter(a=>a.gateId===gate.id).at(-1);
      const receipts = run.receipts.filter(r => attempt.receiptIds.includes(r.id));
      if (receipts.some(r => r.state === "fail")) state = "fail";
      else if (receipts.some(r => r.state === "blocked")) state = "blocked";
      else if(receipts.some(r=>r.state==="unverified"))state="unverified";
      else if (gate.methods.every(method => gate.requiredRoles.every(role => receipts.some(r => r.method === method && r.role === role && r.state === "pass" && (method!=="local" || !gate.localCaseIds.length || r.expectedCases===gate.localCaseIds.length))))) {
        state = "pass";
        for (const receipt of receipts) {
          const age = now - Date.parse(receipt.completedAt);
          const limit = ["G16", "G17", "G18", "G19", "G22"].includes(gate.id) ? 30 * 60_000 : 24 * 60 * 60_000;
          if (age < 0 || ["hosted", "automated-role-exercise"].includes(receipt.method) && age > limit) state = "unverified";
        }
      }
      if(latest?.id!==attempt.id)state="unverified";
      if (state === "pass" && gate.dependsOn.some(id => gates.find(g => g.id === id)?.state !== "pass")) state = "blocked";
      if(state==='pass'&&run.gateVerifications!==undefined){
       const reference=run.gateVerifications.find(row=>row.gateId===gate.id),observation=observations.find(row=>row.id===reference?.id);
       if(!reference||!observation||!verifyGateObservation(run,observation,observations,now))state='unverified';
      }else if(state==='pass')for(const dependency of gate.dependsOn){
        const dependencyId=run.selectedAttempts.find(s=>s.gateId===dependency)?.attemptId;
        const lastDependency=Math.max(...run.receipts.filter(r=>r.attemptId===dependencyId).map(r=>Date.parse(r.completedAt)));
        if(receipts.some(r=>Date.parse(r.startedAt)<lastDependency))state='blocked';
      }
    }
    gates.push({ id: gate.id, state });
  }
  return { version: "pilot-readiness-v1", technicalEligibility: gates.every(g => g.state === "pass") ? "eligible" : "ineligible", releaseApproved: false as const, gates };
}
/** The proof reader authenticates the observation file digest before this
 * structural check. Original execution evidence remains separately mandatory. */
export function verifyGateObservation(run:PilotRun,raw:unknown,observations:readonly PilotGateVerification[],now=Date.now()){
 const parsed=pilotGateVerificationSchema.safeParse(raw);if(!parsed.success)return false;const value=parsed.data,gate=catalog.gates.find(row=>row.id===value.gateId),selected=run.selectedAttempts.find(row=>row.gateId===value.gateId);
 const ownReference=run.gateVerifications?.find(row=>row.gateId===value.gateId);
 if(!ownReference||ownReference.id!==value.id||!gate||selected?.attemptId!==value.attemptId||value.runId!==run.id||Date.parse(value.completedAt)>now)return false;
 for(const key of ['environmentMarker','sourceCommit','sourceDigest','catalogDigest','scopeDigest'] as const)if(value[key]!==run[key])return false;
 const attempt=run.attempts.find(row=>row.id===value.attemptId);if(!attempt||value.executions.length!==attempt.receiptIds.length)return false;
 for(const execution of value.executions){const receipt=run.receipts.find(row=>row.id===execution.receiptId);if(!receipt||!attempt.receiptIds.includes(receipt.id)||receipt.proofDigest!==execution.proofDigest||receipt.startedAt!==execution.startedAt||receipt.completedAt!==execution.completedAt)return false;}
 if(value.dependencies.length!==gate.dependsOn.length)return false;
 for(const id of gate.dependsOn){const binding=value.dependencies.find(row=>row.gateId===id),reference=run.gateVerifications?.find(row=>row.gateId===id),dependency=observations.find(row=>row.id===reference?.id);if(!binding||!reference||!dependency||binding.verificationId!==reference.id||binding.proofDigest!==reference.proofDigest||Date.parse(dependency.completedAt)>Date.parse(value.startedAt))return false;}
 return true;
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--run") throw new Error("Expected explicit private run manifest");
  const target = path.resolve(args[1]);
  // Read through the same private-file guard used for receipts, including mode/owner checks.
  const input = await readEvidence(path.dirname(target), path.basename(target));
  const run = parsePilotRun(JSON.stringify(input));
  const current = await pilotSource();
  if (run.sourceCommit !== current.sourceCommit || run.sourceDigest !== current.sourceDigest || run.catalogDigest !== current.catalogDigest) throw new Error("Run does not match current source/catalog");
  // Proof bytes must be present explicitly in this run directory; no discovery of old passes.
  for (const receipt of run.receipts) {
    const proof=verifyPilotProof(receipt, await readEvidence(path.dirname(target), `${receipt.id}.json`, receipt.proofDigest));
    const required=catalog.gates.find(g=>g.id===receipt.gateId)?.localCaseIds??[];
    if(receipt.method==="local" && required.length>0 && (required.length!==proof.cases.length || required.some(id=>!proof.cases.some(c=>c.id===id))))throw new Error("Proof does not cover frozen local inventory");
  }
  if(run.receipts.some(row=>row.gateId==='G19'&&row.method==='hosted')){const {verifyHostedSdkEvidence}=await import('./pilot-hosted-journey-evidence');await verifyHostedSdkEvidence(path.dirname(target),run);}
  for(const gateId of ['G10','G12'])if(run.receipts.some(row=>row.gateId===gateId&&row.method==='local')){const {verifyPilotAuxiliaryEvidence}=await import('./pilot-auxiliary-evidence');if((await verifyPilotAuxiliaryEvidence(path.dirname(target),run)).gateId!==gateId)throw Error('Typed auxiliary gate evidence differs');}
  const observations:PilotGateVerification[]=[];
  for(const reference of run.gateVerifications??[]){const value=pilotGateVerificationSchema.parse(await readEvidence(path.dirname(target),`${reference.id}.json`,reference.proofDigest));if(value.gateId!==reference.gateId||value.id!==reference.id)throw Error('Gate verification identity differs');observations.push(value);}
  const result = checkPilotReadiness(run,Date.now(),observations);
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exitCode = result.technicalEligibility === "eligible" ? 0 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { process.stderr.write("Pilot evidence invalid or unsafe; no eligibility established.\n"); process.exitCode = 2; });
}
