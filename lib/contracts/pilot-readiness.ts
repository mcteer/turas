import { z } from "zod";

export const PILOT_CONTRACT_VERSION = "pilot-readiness-v1" as const;
export const pilotGateIds = Array.from({ length: 22 }, (_, i) => `G${String(i + 1).padStart(2, "0")}`) as [string, ...string[]];
export const pilotMethods = ["local", "ci", "hosted", "actual-model-reviewed", "human-feedback", "automated-role-exercise"] as const;
export const pilotRoles = ["internal-admin", "internal-member", "assigned-partner", "operator", "reviewer", "automation"] as const;
export const pilotDigest = z.string().regex(/^[a-f0-9]{64}$/);
export const pilotCommit = z.string().regex(/^[a-f0-9]{40}$/);
const uuid = z.uuid();
const identity = z.string().min(1).max(256).regex(/^[A-Za-z0-9_.:-]+$/);
const timestamp = z.iso.datetime({ offset: true });
const origin = z.url().max(2048).refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
}, "Expected a canonical HTTPS origin without credentials");
export const pilotGateState = z.enum(["pass", "fail", "blocked", "unverified"]);
export const pilotHostedIdentity = z.strictObject({
  deploymentId: identity, commit: pilotCommit, origin, environmentMarker: identity,
  schemaLedgerDigest: pilotDigest, runtimeGrantsVerified: z.boolean(),
});
export const pilotReceiptSchema = z.strictObject({
  version: z.literal(PILOT_CONTRACT_VERSION), id: uuid, runId: uuid, attemptId: uuid,
  gateId: z.enum(pilotGateIds), method: z.enum(pilotMethods), role: z.enum(pilotRoles),
  workspaceId: uuid, environmentMarker: identity, sourceCommit: pilotCommit,
  sourceDigest: pilotDigest, catalogDigest: pilotDigest, scopeDigest: pilotDigest,
  startedAt: timestamp, completedAt: timestamp, state: pilotGateState,
  expectedCases: z.number().int().positive().max(100000),
  passedCases: z.number().int().nonnegative().max(100000),
  failedCases: z.number().int().nonnegative().max(100000),
  skippedCases: z.number().int().nonnegative().max(100000),
  flakyCases: z.number().int().nonnegative().max(100000),
  proofDigest: pilotDigest, hosted: pilotHostedIdentity.optional(),
}).superRefine((receipt, ctx) => {
  if (Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt)) ctx.addIssue({ code: "custom", message: "Invalid time interval" });
  if (receipt.passedCases + receipt.failedCases + receipt.skippedCases !== receipt.expectedCases) ctx.addIssue({ code: "custom", message: "Incomplete case inventory" });
  if (receipt.state === "pass" && (receipt.passedCases !== receipt.expectedCases || receipt.failedCases || receipt.skippedCases || receipt.flakyCases)) ctx.addIssue({ code: "custom", message: "Incomplete or unstable pass" });
  if (["hosted", "automated-role-exercise"].includes(receipt.method) && (!receipt.hosted || !receipt.hosted.runtimeGrantsVerified || receipt.hosted.environmentMarker !== receipt.environmentMarker || receipt.hosted.commit !== receipt.sourceCommit)) ctx.addIssue({ code: "custom", message: "Invalid hosted attribution" });
  if (!["hosted", "automated-role-exercise"].includes(receipt.method) && receipt.hosted) ctx.addIssue({ code: "custom", message: "Unexpected hosted identity" });
});
export const pilotAttemptSchema = z.strictObject({
  id: uuid, gateId: z.enum(pilotGateIds), complete: z.literal(true),
  receiptIds: z.array(uuid).min(1).max(512),
}).refine(a => new Set(a.receiptIds).size === a.receiptIds.length, "Duplicate receipts");
export const pilotRunSchema = z.strictObject({
  version: z.literal(PILOT_CONTRACT_VERSION), id: uuid, createdAt: timestamp,
  environmentMarker: identity, sourceCommit: pilotCommit, sourceDigest: pilotDigest,
  catalogDigest: pilotDigest, scopeDigest: pilotDigest,
  attempts: z.array(pilotAttemptSchema).max(128),
  selectedAttempts: z.array(z.strictObject({ gateId: z.enum(pilotGateIds), attemptId: uuid })).max(128),
  receipts: z.array(pilotReceiptSchema).max(512),
}).superRefine((run, ctx) => {
  for (const values of [run.attempts.map(a => a.id), run.receipts.map(r => r.id), run.selectedAttempts.map(s => s.gateId)]) {
    if (new Set(values).size !== values.length) ctx.addIssue({ code: "custom", message: "Duplicate run identity" });
  }
  for (const selected of run.selectedAttempts) {
    if (!run.attempts.some(a => a.id === selected.attemptId && a.gateId === selected.gateId)) ctx.addIssue({ code: "custom", message: "Unknown selected attempt" });
  }
  for (const attempt of run.attempts) for (const id of attempt.receiptIds) {
    const receipt = run.receipts.find(r => r.id === id);
    if (!receipt || receipt.runId !== run.id || receipt.attemptId !== attempt.id || receipt.gateId !== attempt.gateId) ctx.addIssue({ code: "custom", message: "Foreign attempt receipt" });
  }
  for (const receipt of run.receipts) {
    for (const key of ["environmentMarker", "sourceCommit", "sourceDigest", "catalogDigest", "scopeDigest"] as const) {
      if (receipt[key] !== run[key]) ctx.addIssue({ code: "custom", message: "Receipt attribution mismatch" });
    }
    if (!run.attempts.some(a => a.id === receipt.attemptId && a.receiptIds.includes(receipt.id))) ctx.addIssue({ code: "custom", message: "Orphan receipt" });
  }
});
export const pilotFeedbackSchema = z.strictObject({
  version: z.literal(PILOT_CONTRACT_VERSION), id: uuid, runId: uuid,
  participantId: uuid, workspaceId: uuid, journey: z.string().regex(/^J0(?:0[2-9]|1[0-5])$/),
  role: z.enum(["internal-member", "assigned-partner"]), submittedAt: timestamp,
  severity: z.enum(["blocker", "major", "minor"]),
  disposition: z.enum(["open", "fixed", "accepted"]), ownerId: uuid, proofDigest: pilotDigest,
});
export const pilotRecoverySchema = z.strictObject({
  version: z.literal(PILOT_CONTRACT_VERSION), id: uuid, environmentMarker: identity,
  sourceCommit: pilotCommit, schemaLedgerDigest: pilotDigest, capturedAt: timestamp,
  databaseDigest: pilotDigest, objectInventoryDigest: pilotDigest,
  workflowCapability: z.enum(["exported", "reconcile-interrupted"]),
  workflowDigest: pilotDigest.optional(), currentAuthorityDigest: pilotDigest,
  encryptionKeyId: identity, imageDigests: z.array(pilotDigest).min(1).max(16),
  outsideFailureDomainVerified: z.literal(true),
}).refine(r => r.workflowCapability !== "exported" || !!r.workflowDigest, "Missing workflow export");
export type PilotRun = z.infer<typeof pilotRunSchema>;
export type PilotReceipt = z.infer<typeof pilotReceiptSchema>;
export function parsePilotRun(input: string): PilotRun {
  if (Buffer.byteLength(input, "utf8") > 1024 * 1024) throw new Error("Pilot metadata exceeds limit");
  return pilotRunSchema.parse(JSON.parse(input));
}

export const pilotCatalogSchema = z.strictObject({
 version:z.literal(PILOT_CONTRACT_VERSION),
 gates:z.array(z.strictObject({id:z.enum(pilotGateIds),name:z.string().min(1).max(80),methods:z.array(z.enum(pilotMethods)).min(1).max(5),requiredRoles:z.array(z.enum(pilotRoles)).min(1).max(6),dependsOn:z.array(z.enum(pilotGateIds)).max(22),mandatory:z.literal(true),localCaseIds:z.array(identity).max(10000)})).length(22),
 journeys:z.array(z.string().regex(/^J0(?:0[2-9]|1[0-5])$/)).length(14),
 maintenance:z.array(z.strictObject({id:z.enum(["conversation","artifacts","workforce","retrieval","research-freshness","knowledge","plans","execution","support","expansion","reports","gaps","partners","learning","mcp"]),intervalMs:z.number().int().positive().max(30000),staleAfterMs:z.number().int().positive().max(300000),batchLimit:z.number().int().positive().max(1000)})).length(15),
 roles:z.array(z.enum(pilotRoles)).length(6),optionalCapabilities:z.array(z.literal("outbound-report-delivery")).length(1),
 workload:z.strictObject({sessions:z.literal(25),customers:z.literal(250),passages:z.literal(10000),warmupMs:z.literal(120000),measurementMs:z.literal(600000),maxTotalMs:z.literal(3600000),samplesPerClass:z.literal(100),ordinaryP95Ms:z.literal(2000),mcpP95Ms:z.literal(1000),failureRateBelow:z.literal(0.01)}),
}).superRefine((catalog,ctx)=>{
 for(const row of catalog.maintenance)if(row.staleAfterMs>Math.min(180000,row.intervalMs*3))ctx.addIssue({code:'custom',message:'Maintenance stale threshold exceeds three intervals'});
 for(const ids of [catalog.gates.map(g=>g.id),catalog.journeys,catalog.maintenance.map(m=>m.id),catalog.roles]) if(new Set(ids).size!==ids.length)ctx.addIssue({code:"custom",message:"Duplicate catalog identity"});
 const seen=new Set<string>();for(const gate of catalog.gates){if(gate.dependsOn.some(id=>!seen.has(id)))ctx.addIssue({code:"custom",message:"Catalog dependency order is invalid"});seen.add(gate.id);if(new Set(gate.methods).size!==gate.methods.length)ctx.addIssue({code:"custom",message:"Duplicate method"});}
});

export const pilotProofSchema=z.strictObject({
 version:z.literal("pilot-proof-v1"),receiptId:uuid,runId:uuid,attemptId:uuid,
 gateId:z.enum(pilotGateIds),method:z.enum(pilotMethods),role:z.enum(pilotRoles),
 workspaceId:uuid,environmentMarker:identity,sourceCommit:pilotCommit,sourceDigest:pilotDigest,
 catalogDigest:pilotDigest,scopeDigest:pilotDigest,startedAt:timestamp,completedAt:timestamp,
 state:pilotGateState,cases:z.array(z.strictObject({id:identity,state:z.enum(["pass","fail","skipped"]),flaky:z.boolean()})).min(1).max(100000),
}).refine(proof=>new Set(proof.cases.map(c=>c.id)).size===proof.cases.length,"Duplicate proof cases");
export function verifyPilotProof(receipt:PilotReceipt,input:unknown){
 const proof=pilotProofSchema.parse(input);
 if(proof.receiptId!==receipt.id)throw new Error("Foreign proof receipt");
 for(const key of ["runId","attemptId","gateId","method","role","workspaceId","environmentMarker","sourceCommit","sourceDigest","catalogDigest","scopeDigest","startedAt","completedAt","state"] as const)
  if(proof[key]!==receipt[key])throw new Error("Proof attribution mismatch");
 const counts={expectedCases:proof.cases.length,passedCases:proof.cases.filter(c=>c.state==="pass").length,failedCases:proof.cases.filter(c=>c.state==="fail").length,skippedCases:proof.cases.filter(c=>c.state==="skipped").length,flakyCases:proof.cases.filter(c=>c.flaky).length};
 for(const key of Object.keys(counts) as (keyof typeof counts)[])if(counts[key]!==receipt[key])throw new Error("Proof inventory mismatch");
 return proof;
}
