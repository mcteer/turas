import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {assertCustomerQuestionReads,readCustomerAccountEvidence} from './customer-accounts';
import {conversationFeature} from './feature';
import {confirmedConflictAfter,originalCurrent} from '../retrieval/fences';
import {hiddenRecord} from '../../contracts/http';

type Principal=Parameters<typeof readCustomerAccountEvidence>[1];
/** Ordinary chat keeps its dated history, but refreshes active factual context
 * before each model call. Original citations and retrieval receipts stay intact.
 * Every historical customer grant/audience is still checked, including retired
 * dependencies. Governed workflows keep their original strict fences. */
export async function refreshOrdinaryKnowledge(db:PoolClient,actor:CurrentSession,
 principal:Principal,conversationId:string,attemptId:string){
 if((await conversationFeature(db,conversationId)).kind!=='normal')throw hiddenRecord();
 await assertCustomerQuestionReads(db,actor,conversationId,attemptId,false);
 const customers=(await db.query<{customer_id:string}>(`SELECT customer_id FROM (
  SELECT s.customer_id FROM general_customer_read_scopes s JOIN response_attempts a ON a.id=s.attempt_id WHERE a.conversation_id=$1
  UNION SELECT r.customer_id FROM session_evidence_dependencies d JOIN retrieval_receipts r ON r.id=d.receipt_id WHERE d.conversation_id=$1
  UNION SELECT customer_id FROM conversations WHERE id=$1
 ) accounts WHERE customer_id IS NOT NULL ORDER BY customer_id`,[conversationId])).rows;
 const contexts:unknown[]=[];let bytes=0;
 for(const {customer_id} of customers){
  // Always register a current authoritative brief, even if no facts remain.
  const context=await readCustomerAccountEvidence(db,principal,customer_id);
  await db.query(`UPDATE general_customer_read_scopes SET citation_ids=$3,checked_at=clock_timestamp()
   WHERE attempt_id=$1 AND customer_id=$2`,[attemptId,customer_id,context.entries.map(entry=>`${entry.type}:${entry.citationId}`)]);
  const body={...context,notice:'Current authorized customer knowledge. Earlier conversation evidence is dated; omitted entries require the customer evidence tools, not an inference of absence.'};
  const size=Buffer.byteLength(JSON.stringify(body));
  if(bytes+size<=64*1024){contexts.push(body);bytes+=size;}
  else contexts.push({customerId:customer_id,contextVersion:context.contextVersion,notice:'Additional current knowledge is available through get_customer_evidence; this packet is incomplete.'});
 }
 const dependencies=(await db.query(`SELECT d.*,r.as_of AS receipt_as_of FROM session_evidence_dependencies d
  JOIN retrieval_receipts r ON r.id=d.receipt_id WHERE d.conversation_id=$1
   AND NOT EXISTS(SELECT 1 FROM ordinary_evidence_refreshes f WHERE f.dependency_id=d.id)
  ORDER BY d.consumed_at,d.id`,[conversationId])).rows;
 const retired:string[]=[];
 for(const d of dependencies){
  if(d.valid_until.getTime()<=Date.now() || await confirmedConflictAfter(db,d.source_kind,d.source_revision_id,d.receipt_as_of)
   || !await originalCurrent(db,d))retired.push(d.id);
 }
 const packet={contractVersion:'ordinary-current-knowledge-v1',asOf:new Date().toISOString(),contexts,
  retiredHistoricalEvidence:retired.length,
  notice:retired.length?'Some earlier evidence expired, changed, or was withdrawn. Treat it as historical, not current support. Re-query evidence tools for current passages, especially shared solution guidance.':undefined};
 const digest=createHash('sha256').update(JSON.stringify(packet)).digest('hex');
 const id=randomUUID();
 await db.query(`INSERT INTO ordinary_context_refreshes(id,attempt_id,conversation_id,packet_digest,customer_ids) VALUES($1,$2,$3,$4,$5)`,[id,attemptId,conversationId,digest,customers.map(c=>c.customer_id)]);
 for(const dependencyId of retired)await db.query(`INSERT INTO ordinary_evidence_refreshes(dependency_id,refresh_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[dependencyId,id]);
 // Recheck still-active exact dependencies and the newest brief before I/O.
 await assertCustomerQuestionReads(db,actor,conversationId,attemptId);
 return customers.length||retired.length?packet:null;
}
