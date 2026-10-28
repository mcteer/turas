import {randomUUID,createHash} from 'node:crypto';
import {Client,type PoolClient} from 'pg';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {pilotPublishedKnowledgeFixture} from './knowledge';
import {createOwnedConversation} from '../../../lib/server/conversations/repository';
import {hostedRootBudgetSchema} from '../../../lib/server/conversations/hosted-root-budget';

export async function withHostedRootBudgetFixture(run:(value:{db:Client;principal:{principalId:string;attributes:{turasAttemptId:string}};native:string;binding:ReturnType<typeof hostedRootBudgetSchema.parse>;attempt:string})=>Promise<void>,target:'preview'|'production'='preview'){
 await withPilotEnvironment(async environment=>{
  const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
  try{
   const f=await pilotPublishedKnowledgeFixture(db as unknown as PoolClient,'synthetic_pilot');
   const {conversation}=await createOwnedConversation(f.actor,{requestKey:randomUUID(),title:'Synthetic root transport acceptance'});
   const native='synthetic-native-'+randomUUID(),attempt=randomUUID(),message=randomUUID(),budgetId=randomUUID();
   await db.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1",[conversation.id,native]);
   const recordedAt=(await db.query('SELECT clock_timestamp() AS time')).rows[0].time.toISOString();
   await db.query("INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,repeat('a',64),'Synthetic root transport')",[message,conversation.id,randomUUID()]);
   await db.query("INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state,deadline_at) VALUES($1,$2,$3,repeat('a',64),'admitted','running',clock_timestamp()+interval '5 minutes')",[attempt,conversation.id,message]);
   const expiresAt=new Date(Date.now()+3600000).toISOString();
   const binding=hostedRootBudgetSchema.parse({contract:'pilot-hosted-root-budget-v1',budgetId,target,projectId:'prj_synthetic',sourceCommit:process.env.TURAS_CODE_VERSION,environmentMarker:environment.environmentId,workspaceId:f.actor.workspaceId,ownerPrincipalId:f.actor.principalId,conversationIds:[conversation.id],recordedAt,expiresAt,capMicroUsd:10000});
   await db.query("INSERT INTO parity_evaluation_budgets(id,environment_id,workspace_id,owner_principal_id,cap_micro_usd,pricing,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)",[budgetId,environment.environmentId,f.actor.workspaceId,f.actor.principalId,binding.capMicroUsd,JSON.stringify({'anthropic/claude-sonnet-5.5':{input:0,output:0.000001}}),expiresAt]);
   await db.query('INSERT INTO operations_hosted_root_admissions(budget_id,deployment_id,binding_digest) VALUES($1,$2,$3)',[budgetId,'dpl_synthetic',createHash('sha256').update(JSON.stringify(binding)).digest('hex')]);
   Object.assign(process.env,{VERCEL_ENV:target,VERCEL_PROJECT_ID:binding.projectId,VERCEL_DEPLOYMENT_ID:'dpl_synthetic',TURAS_PILOT_HOSTED_ROOT_BUDGET_JSON:JSON.stringify(binding)});
   await run({db,principal:{principalId:f.actor.principalId,attributes:{turasAttemptId:attempt}},native,binding,attempt});
  }finally{await db.end();}
 },{postgresMajor:18,deadlineMs:180000});
}

