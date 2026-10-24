import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { DEMO_IDS } from "../../../lib/server/bootstrap-ids";
import { requireOwnedPilotDatabase } from "../../../scripts/pilot-environment";
export async function preparePilotLegacySessions(){
 const client=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await client.connect();
 try{
  const workspace=randomUUID();await client.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic ambiguous primary')",[workspace]);
  await client.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','member')",[randomUUID(),DEMO_IDS.panel,workspace]);
  for(const [principal,digest] of [[DEMO_IDS.mcteer,"a".repeat(64)],[DEMO_IDS.panel,"b".repeat(64)]])await client.query("INSERT INTO login_sessions(id,principal_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[randomUUID(),principal,digest]);
 }finally{await client.end();}
}
