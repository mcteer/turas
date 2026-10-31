import type {PoolClient} from 'pg';
import {HttpFailure} from '../../contracts/http';
import {authenticateRecoveryHttpRead,type RecoveryHttpRead} from './recovery-http-read';

type Binding={request:Request;id:string;proof:RecoveryHttpRead};
const bindings=new WeakMap<PoolClient,Binding>();
/** Previously rendered bytes only. Authority is the live, exact report HTTP
 * admission, never an environment flag, serialized proof or caller brand ID. */
export async function withRecoveryReportBrand<T>(db:PoolClient,request:Request,id:string,read:()=>Promise<T>){
 const proof=await authenticateRecoveryHttpRead(db,request,id,false);
 if(proof.readKind!=='report'||!proof.recordId||!proof.recordParentId||!proof.recordRevisionId||bindings.has(db))throw new HttpFailure(403,'recovery_scope_denied','Recovery report unavailable');
 bindings.set(db,{request,id,proof});
 try{const result=await read();await authenticateRecoveryHttpRead(db,request,id,false);return result;}
 finally{bindings.delete(db);}
}
/** Reauthenticate every canonical brand fence, including every stream chunk.
 * Return only the exact captured artifact's immutable renderer/brand binding. */
export async function recoveryReportBrandBinding(db:PoolClient,workspaceId:string,brandId:string){
 const binding=bindings.get(db);if(!binding)return null;
 const {proof,request,id}=binding;
 if(proof.actor.workspaceId!==workspaceId||request.signal.aborted||proof.deadline<=Date.now())throw new HttpFailure(403,'recovery_scope_denied','Recovery report unavailable');
 await authenticateRecoveryHttpRead(db,request,id,false);
 const rows=(await db.query(`SELECT a.renderer_digest,a.brand_digest,a.font_digest,a.template_digest
 FROM report_artifacts a JOIN report_revisions r ON r.id=a.revision_id
 WHERE a.id=$1 AND a.environment_id=$2 AND a.workspace_id=$3 AND a.customer_id=$4
 AND r.id=$5 AND r.report_id=$6 AND r.brand_id=$7 AND a.content_digest=$8 AND a.size_bytes=$9
 AND r.revision_number=$10 AND a.validation_id IS NOT NULL`,[proof.recordId,proof.environmentId,workspaceId,proof.customerId,proof.recordRevisionId,proof.recordParentId,brandId,proof.recordDigest,proof.recordSize,proof.recordGeneration])).rows;
 if(rows.length!==1)throw new HttpFailure(403,'recovery_scope_denied','Recovery report binding changed');
 return rows[0] as {renderer_digest:string;brand_digest:string;font_digest:string;template_digest:string};
}
