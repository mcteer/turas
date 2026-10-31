import {it,expect} from 'vitest';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {runHostedTrainingJourney} from '../../../scripts/pilot-hosted-training';
import type {PilotHostedScope} from '../../../lib/contracts/pilot-hosted';
import type {HostedConfiguration} from '../../../lib/server/operations/hosted-configuration';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
it('requires an active exact partner grant and an ordinarily accepted training source before role callbacks',async()=>{
 await withPilotEnvironment(async environment=>{
  const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
  try{
   const workspaceId=randomUUID(),customerId=randomUUID(),organizationId=randomUUID(),membershipId=randomUUID();
   await db.query("INSERT INTO workspaces(id,name,classification,pilot_environment_id,pilot_provisioning_id) VALUES($1,'Synthetic training admission','synthetic_pilot',$2,$3)",[workspaceId,environment.environmentId,randomUUID()]);
   await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic training customer',true)",[customerId,workspaceId]);
   await db.query("INSERT INTO partner_organizations(id,workspace_id,name) VALUES($1,$2,'Synthetic training partner')",[organizationId,workspaceId]);
   await db.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role,partner_org_id) VALUES($1,$2,$3,'partner','member',$4)",[membershipId,DEMO_IDS.partner,workspaceId,organizationId]);
   const scope={workspaceId,environmentMarker:environment.environmentId,sourceCommit:process.env.TURAS_CODE_VERSION!,origin:'https://synthetic.example'} as PilotHostedScope;
   let calls=0;const transport:typeof fetch=async()=>{calls++;return new Response(JSON.stringify({data:{items:[]}}),{status:200,headers:{'content-type':'application/json','x-turas-code-version':scope.sourceCommit}});};
   const input={scope,db,headers:new Headers(),configuration:{} as HostedConfiguration,customerId,engagementId:randomUUID(),baselineId:randomUUID(),acceptedRevisionId:randomUUID(),sourceRevisionId:randomUUID(),signal:environment.signal,transport};
   await expect(runHostedTrainingJourney(input)).rejects.toThrow('currently assigned');expect(calls).toBe(0);
   await db.query("INSERT INTO customer_grants(id,workspace_id,membership_id,customer_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),workspaceId,membershipId,customerId,DEMO_IDS.mcteer]);
   await expect(runHostedTrainingJourney(input)).rejects.toThrow('ordinarily accepted training source');expect(calls).toBe(1);
   await db.query('UPDATE partner_organizations SET active=false WHERE id=$1',[organizationId]);
   await expect(runHostedTrainingJourney(input)).rejects.toThrow('currently assigned');expect(calls).toBe(1);
  }finally{await db.end();}
 },{postgresMajor:18,deadlineMs:180000});
},210000);
