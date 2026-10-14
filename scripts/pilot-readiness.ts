import { fileURLToPath } from "node:url";
import path from "node:path";
import { parsePilotRun, verifyPilotProof, type PilotRun } from "../lib/contracts/pilot-readiness";
import { readEvidence } from "./pilot-evidence";
import { pilotSource } from "./pilot-source";
import { pilotCatalog as catalog } from "./pilot-catalog";

export function checkPilotReadiness(run: PilotRun, now = Date.now()) {
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
          if (age < 0 || receipt.method === "hosted" && age > limit) state = "unverified";
        }
      }
      if(latest?.id!==attempt.id)state="unverified";
      if (state === "pass" && gate.dependsOn.some(id => gates.find(g => g.id === id)?.state !== "pass")) state = "blocked";
      if(state==="pass")for(const dependency of gate.dependsOn){
        const dependencyId=run.selectedAttempts.find(s=>s.gateId===dependency)?.attemptId;
        const lastDependency=Math.max(...run.receipts.filter(r=>r.attemptId===dependencyId).map(r=>Date.parse(r.completedAt)));
        if(receipts.some(r=>Date.parse(r.startedAt)<lastDependency))state="blocked";
      }
    }
    gates.push({ id: gate.id, state });
  }
  return { version: "pilot-readiness-v1", technicalEligibility: gates.every(g => g.state === "pass") ? "eligible" : "ineligible", releaseApproved: false as const, gates };
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
    if(receipt.method==="local" && (required.length!==proof.cases.length || required.some(id=>!proof.cases.some(c=>c.id===id))))throw new Error("Proof does not cover frozen local inventory");
  }
  const result = checkPilotReadiness(run);
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exitCode = result.technicalEligibility === "eligible" ? 0 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { process.stderr.write("Pilot evidence invalid or unsafe; no eligibility established.\n"); process.exitCode = 2; });
}
