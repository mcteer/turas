import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { DEMO_IDS } from "../../../lib/server/bootstrap-ids";
import { requireOwnedPilotDatabase } from "../../../scripts/pilot-environment";
export async function ensurePilotWorkspaceFixture(owner:Client){
 requireOwnedPilotDatabase(process.env,true);
 let workspace=(await owner.query("SELECT id FROM workspaces WHERE classification='synthetic_pilot' AND pilot_environment_id=$1 AND active",[process.env.TURAS_ENVIRONMENT_ID])).rows[0]?.id as string|undefined;
 if(!workspace){workspace=randomUUID();await owner.query("INSERT INTO workspaces(id,name,classification,pilot_environment_id,pilot_provisioning_id) VALUES($1,'Synthetic pilot test workspace','synthetic_pilot',$2,$3)",[workspace,process.env.TURAS_ENVIRONMENT_ID,randomUUID()]);}
 const id=randomUUID();await owner.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','admin') ON CONFLICT(principal_id,workspace_id) DO NOTHING",[id,DEMO_IDS.mcteer,workspace]);
 const membership=(await owner.query("SELECT id FROM memberships WHERE principal_id=$1 AND workspace_id=$2",[DEMO_IDS.mcteer,workspace])).rows[0].id as string;
 return {workspace,membership};
}
