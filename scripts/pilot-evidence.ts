import { constants } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export const evidenceDigest = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const MAX_BYTES = 1024 * 1024;
async function ownedDirectory(root: string) {
  const resolved = path.resolve(root);
  const info = await lstat(resolved);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o700 || info.uid !== process.getuid?.()) throw new Error("Unsafe evidence directory");
  if (await realpath(resolved) !== resolved) throw new Error("Indirect evidence directory");
  return resolved;
}
function filePath(root: string, name: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}\.json$/.test(name)) throw new Error("Unsafe evidence identity");
  return path.join(root, name);
}
export async function createEvidenceDirectory(root: string) {
  await mkdir(root, { mode: 0o700, recursive: false });
  return ownedDirectory(root);
}
export async function writeEvidence(root: string, name: string, value: unknown) {
  const target = filePath(await ownedDirectory(root), name);
  const bytes = Buffer.from(JSON.stringify(value) + "\n");
  if (bytes.length > MAX_BYTES) throw new Error("Evidence exceeds limit");
  const file = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  return evidenceDigest(bytes);
}
export async function readEvidence(root: string, name: string, digest?: string) {
  if (digest !== undefined && !/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid evidence digest");
  const target = filePath(await ownedDirectory(root), name);
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid?.() || stat.size > MAX_BYTES || stat.nlink !== 1) throw new Error("Unsafe evidence file");
    const bytes = await file.readFile();
    if (bytes.length > MAX_BYTES || digest !== undefined && evidenceDigest(bytes) !== digest) throw new Error("Evidence integrity failure");
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } finally { await file.close(); }
}

/** Append complete attempts only; previous bytes stay immutable on disk. */
export async function appendPilotAttempt(root:string, previousName:string, previousDigest:string,
 nextName:string, attempt:unknown, receipts:unknown[]) {
 const {pilotRunSchema,pilotAttemptSchema,pilotReceiptSchema,verifyPilotProof}=await import("../lib/contracts/pilot-readiness");
 const previous=pilotRunSchema.parse(await readEvidence(root,previousName,previousDigest));
 const current=await (await import("./pilot-source")).pilotSource();
 if(previous.sourceCommit!==current.sourceCommit||previous.sourceDigest!==current.sourceDigest||previous.catalogDigest!==current.catalogDigest)throw new Error("Resume source/catalog changed");
 for(const receipt of previous.receipts)verifyPilotProof(receipt,await readEvidence(root,`${receipt.id}.json`,receipt.proofDigest));
 const parsedAttempt=pilotAttemptSchema.parse(attempt);
 const parsedReceipts=receipts.map(r=>pilotReceiptSchema.parse(r));
 if(previous.attempts.some(a=>a.id===parsedAttempt.id)||parsedAttempt.receiptIds.length!==parsedReceipts.length)
  throw new Error("Attempt must be a complete new execution");
 for(const receipt of parsedReceipts)verifyPilotProof(receipt,await readEvidence(root,`${receipt.id}.json`,receipt.proofDigest));
 const next=pilotRunSchema.parse({...previous,attempts:[...previous.attempts,parsedAttempt],
  receipts:[...previous.receipts,...parsedReceipts],selectedAttempts:[...previous.selectedAttempts.filter(s=>s.gateId!==parsedAttempt.gateId),{gateId:parsedAttempt.gateId,attemptId:parsedAttempt.id}]});
 return writeEvidence(root,nextName,next);
}
