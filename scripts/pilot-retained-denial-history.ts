import {recoveryDigest} from '../lib/contracts/pilot-recovery';
import {requireAuthenticatedRetainedDenials,requireRetainedWorkDenialContinuation,type RetainedWorkDenials} from './pilot-denial-reader';
/** These current authority rows may advance their status. Every prior identity
 * and replay key still has to remain present. Other retained rows are immutable
 * for this conservative verification run, including all effect/accounting data. */
const mutableAuthority=new Set(['workspaces','partner_organizations','principals','memberships','login_sessions','customer_grants','mcp_connections','artifact_versions','profile_lifecycle_events','knowledge_publications','retrieval_sources','report_revision_states']);
export type RetainedWorkDenialHistory=Readonly<{contract:'pilot-retained-denial-history-v1';environmentId:string;backupCapturedAt:string;baselineDigest:string;currentDigest:string;historyDigest:string;captures:number}>;
const histories=new WeakMap<object,{baseline:RetainedWorkDenials;current:RetainedWorkDenials}>();
function preserve(previous:RetainedWorkDenials,current:RetainedWorkDenials){
 requireRetainedWorkDenialContinuation(previous,current,previous.snapshot.environmentId);
 const tables=new Map(current.snapshot.tables.map(table=>[table.name,table]));
 for(const table of previous.snapshot.tables){const next=tables.get(table.name);if(!next||table.schemaDigest!==next.schemaDigest||recoveryDigest(table.primaryKey)!==recoveryDigest(next.primaryKey)||recoveryDigest(table.replayKeyColumns??[])!==recoveryDigest(next.replayKeyColumns??[]))throw Error('Original retained history table binding changed');const rows=new Map(next.rows.map(row=>[recoveryDigest(row.identity),row]));
  for(const row of table.rows){const retained=rows.get(recoveryDigest(row.identity));if(!retained||recoveryDigest(row.replayKeys??[])!==recoveryDigest(retained.replayKeys??[]))throw Error('Original retained history identity or replay key missing');if(!mutableAuthority.has(table.name)&&recoveryDigest(row)!==recoveryDigest(retained))throw Error('Original retained effect or accounting row changed');}
 }
}
export function beginRetainedWorkDenialHistory(baseline:RetainedWorkDenials,current:RetainedWorkDenials=baseline):RetainedWorkDenialHistory{
 preserve(baseline,current);requireAuthenticatedRetainedDenials(current,current.snapshot.environmentId);
 const proof=Object.freeze({contract:'pilot-retained-denial-history-v1' as const,environmentId:current.snapshot.environmentId,backupCapturedAt:current.backupCapturedAt,baselineDigest:baseline.contextDigest,currentDigest:current.contextDigest,historyDigest:recoveryDigest({baseline:baseline.contextDigest,current:current.contextDigest}),captures:1});histories.set(proof,{baseline,current});return proof;
}
export function advanceRetainedWorkDenialHistory(proof:RetainedWorkDenialHistory,current:RetainedWorkDenials){
 const actual=histories.get(proof);if(!actual||proof.captures>=9)throw Error('Genuine finite original retained history required');preserve(actual.current,current);
 const next=Object.freeze({...proof,currentDigest:current.contextDigest,historyDigest:recoveryDigest({previous:proof.historyDigest,current:current.contextDigest}),captures:proof.captures+1});histories.delete(proof);histories.set(next,{baseline:actual.baseline,current});return next;
}
/** Historical bytes never authorize a new credential. Current authority remains
 * genuinely fresh; preserved row identity/hash continuity protects every prior
 * financial/provider/replay observation before the final live audits rerun. */
export function requireRetainedWorkDenialHistory(proof:RetainedWorkDenialHistory,current:RetainedWorkDenials,environmentId:string){
 const actual=histories.get(proof);if(!actual||actual.current!==current||proof.environmentId!==environmentId||proof.currentDigest!==current.contextDigest||proof.baselineDigest!==actual.baseline.contextDigest||proof.backupCapturedAt!==current.backupCapturedAt)throw Error('Genuine current preserved retained history required');preserve(actual.baseline,current);return {baseline:actual.baseline,current,historyDigest:proof.historyDigest};
}
