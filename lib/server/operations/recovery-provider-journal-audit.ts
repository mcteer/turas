import type {Client} from 'pg';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {requireAuthenticatedRetainedDenials,type RetainedWorkDenials} from '../../../scripts/pilot-denial-reader';
import {isWorkRecoveryDecisionClient,requireLockedWorkRecoveryConnection,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import {currentRecoveryStateDigest} from './recovery-state';
const journals=/^(?:research_operations|retrieval_embedding_operations|(?:plan|staffing|execution|support|expansion)_(?:model_step(?:_usage)?_receipts|advice_steps|advice_usage|drafting_usage))$/;
/** These dispatch/usage journals are not rewritten by quarantine. Preserve every
 * original row, including unknown provider outcomes and original quota ceilings.
 * Row hashes bind fields deliberately omitted from minimized denial metadata.
 * Typed dollar/token/learning/service holds and terminal providers remain separate. */
export async function auditRecoveryProviderJournals(db:Client,target:LockedWorkRecoveryTarget,retained:RetainedWorkDenials){
 if(!isWorkRecoveryDecisionClient(db))throw Error('Genuine provider journal owner decision required');
 await requireLockedWorkRecoveryConnection(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
 const source=requireAuthenticatedRetainedDenials(retained,target.environmentId);await currentRecoveryStateDigest(db);
 const names=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row=>String(row.tablename)).filter(name=>journals.test(name));
 const retainedNames=source.snapshot.tables.map(table=>table.name).filter(name=>journals.test(name)).sort();
 if(JSON.stringify(names)!==JSON.stringify(retainedNames))throw Error('Complete original provider journal table inventory differs');
 if(names.length<2||names.length>32||!names.includes('research_operations')||!names.includes('retrieval_embedding_operations'))throw Error('Complete provider journal schema required');
 const observed=[];
 for(const name of names){
  const original=source.snapshot.tables.find(table=>table.name===name);if(!original)throw Error('Independently retained provider journal missing');
  const rows=(await db.query(`SELECT (SELECT jsonb_object_agg(e.key,e.value ORDER BY e.key) FROM jsonb_each(to_jsonb(r)) e WHERE e.key=ANY($1::text[])) AS identity,encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') AS digest FROM public."${name}" r LIMIT 10001`,[original.primaryKey])).rows;
  if(rows.length>10000||rows.length!==original.rows.length)throw Error('Complete original provider journal inventory differs');
  const byIdentity=new Map(rows.map(row=>[recoveryDigest(row.identity),String(row.digest)]));
  if(byIdentity.size!==rows.length||original.rows.some(row=>byIdentity.get(recoveryDigest(row.identity))!==row.rowDigest))throw Error('Original provider dispatch usage ceiling or outcome changed');
  observed.push({name,rows:rows.length,digest:recoveryDigest([...byIdentity].sort(([a],[b])=>a.localeCompare(b)))});
 }
 requireAuthenticatedRetainedDenials(retained,target.environmentId);
 return Object.freeze({contract:'pilot-recovery-provider-journal-audit-v1' as const,environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision,snapshotDigest:source.contextDigest,journalDigest:recoveryDigest(observed),tables:observed.length,rows:observed.reduce((sum,row)=>sum+row.rows,0),originalProviderJournalsPreserved:true as const,unknownOutcomesSettled:false as const,typedCostHoldsVerified:false as const,providerExecutionClosed:false as const,restorationReady:false as const});
}
