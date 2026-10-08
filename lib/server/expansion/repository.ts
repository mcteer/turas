import {retireExpansionAdviceDependency} from './advice-invalidation';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {getServerConfig} from '../config';
import {hiddenRecord} from '../../contracts/http';
import type {ExpansionActor} from './policy';
export async function expansionScope(db:PoolClient,actor:ExpansionActor,customerId:string,workloadId:string|null,options:{create?:boolean;lock?:boolean}={}){
 if(workloadId&&!(await db.query("SELECT 1 FROM customer_workloads WHERE id=$1 AND workspace_id=$2 AND customer_id=$3 AND lifecycle='active'",[workloadId,actor.workspaceId,customerId])).rowCount)throw hiddenRecord();
 const params=[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,workloadId];
 if(options.create)await db.query('INSERT INTO expansion_scopes(id,environment_id,workspace_id,customer_id,workload_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(environment_id,workspace_id,customer_id,workload_id) DO NOTHING',[randomUUID(),...params]);
 const row=(await db.query(`SELECT id,generation,workload_id FROM expansion_scopes WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3 AND workload_id IS NOT DISTINCT FROM $4::uuid ${options.lock?'FOR UPDATE':''}`,params)).rows[0];
 return row?{id:row.id as string,generation:Number(row.generation),workloadId:row.workload_id as string|null}:null;
}
export async function incrementExpansionScope(db:PoolClient,id:string){const r=(await db.query('UPDATE expansion_scopes SET generation=generation+1 WHERE id=$1 RETURNING generation',[id])).rows[0];if(!r)throw hiddenRecord();await retireExpansionAdviceDependency(db,'expansion_scope',id);return Number(r.generation);}
