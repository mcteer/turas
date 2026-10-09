import type { PoolClient } from "pg";
import { getServerConfig } from "../config";
import { HttpFailure } from "../../contracts/http";
import { partnerHash } from "./repository";
import type { PartnerActor } from "./policy";
const partnerActorHash=(actor:PartnerActor)=>partnerHash([getServerConfig().TURAS_ENVIRONMENT_ID,actor.membershipId]);
export async function partnerRate(db:PoolClient,actor:PartnerActor,kind:"read"|"write"){
  const env=getServerConfig().TURAS_ENVIRONMENT_ID,window=new Date(),limits=kind==="read"?[120,1200]:[30,300];
  const keys=[`actor:${partnerActorHash(actor)}`,`workspace:${actor.workspaceId}`];
  for(const key of [...keys].sort())await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`partner-rate:${env}:${kind}:${key}`]);
  for(let i=0;i<keys.length;i++){
    const count=Number((await db.query("SELECT COALESCE(sum(count),0) AS count FROM partner_rate_windows WHERE environment_id=$1 AND scope_key=$2 AND kind=$3 AND window_at>$4",[env,keys[i],kind,new Date(window.getTime()-60000)])).rows[0]?.count??0);
    if(count>=limits[i])throw new HttpFailure(429,"rate_limited","Partner request limit reached",60);
  }
  for(const key of keys)await db.query(`INSERT INTO partner_rate_windows(environment_id,scope_key,kind,window_at,count) VALUES($1,$2,$3,$4,1)
    ON CONFLICT(environment_id,scope_key,kind,window_at) DO UPDATE SET count=partner_rate_windows.count+1`,[env,key,kind,window]);
}
