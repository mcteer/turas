import type { PoolClient } from 'pg';
import type { CurrentSession } from '../auth/sessions';
import { getServerConfig } from '../config';
import { HttpFailure } from '../../contracts/http';
import { learningHash } from './repository';
/** Called only after receipt replay lookup, within the command transaction. */
export async function admitLearningWrite(db: PoolClient, actor: CurrentSession): Promise<void> {
  const environment = getServerConfig().TURAS_ENVIRONMENT_ID;
  const scopes = [`actor:${learningHash([environment, actor.membershipId])}`, 'workspace'];
  for (const scope of [...scopes].sort()) await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
    [`learning-rate:${environment}:${actor.workspaceId}:${scope}`]);
  const now = (await db.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
  for (let index = 0; index < scopes.length; index++) {
    const count = Number((await db.query(`SELECT coalesce(sum(count),0) AS count FROM learning_rate_windows
      WHERE environment_id=$1 AND workspace_id=$2 AND scope_key=$3 AND window_at>$4`,
    [environment, actor.workspaceId, scopes[index], new Date(now.getTime()-60000)])).rows[0].count);
    if (count >= (index === 0 ? 30 : 120)) throw new HttpFailure(429, 'rate_limited', 'Learning request limit reached', 60);
  }
  for (const scope of scopes) await db.query(`INSERT INTO learning_rate_windows(environment_id,workspace_id,scope_key,window_at,count)
    VALUES($1,$2,$3,$4,1) ON CONFLICT(environment_id,workspace_id,scope_key,window_at)
    DO UPDATE SET count=learning_rate_windows.count+1`, [environment, actor.workspaceId, scope, now]);
}

/** Status and private reads have their own finite quota; they do not spend write slots. */
export async function admitLearningRead(db:PoolClient,actor:CurrentSession):Promise<void>{
 const environment=getServerConfig().TURAS_ENVIRONMENT_ID;
 const scopes=[`read-actor:${learningHash([environment,actor.membershipId])}`,'read-workspace'];
 for(const scope of [...scopes].sort())await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`learning-rate:${environment}:${actor.workspaceId}:${scope}`]);
 const now=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
 for(let index=0;index<scopes.length;index++){
  const count=Number((await db.query(`SELECT coalesce(sum(count),0) AS count FROM learning_rate_windows WHERE environment_id=$1 AND workspace_id=$2 AND scope_key=$3 AND window_at>$4`,[environment,actor.workspaceId,scopes[index],new Date(now.getTime()-60000)])).rows[0].count);
  if(count>=(index===0?120:1200))throw new HttpFailure(429,'rate_limited','Learning request limit reached',60);
 }
 for(const scope of scopes)await db.query(`INSERT INTO learning_rate_windows(environment_id,workspace_id,scope_key,window_at,count) VALUES($1,$2,$3,$4,1)
  ON CONFLICT(environment_id,workspace_id,scope_key,window_at) DO UPDATE SET count=learning_rate_windows.count+1`,[environment,actor.workspaceId,scope,now]);
}
