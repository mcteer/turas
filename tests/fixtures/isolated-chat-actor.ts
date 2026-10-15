import {randomUUID} from 'node:crypto';
import type {Client,PoolClient} from 'pg';
import {getCurrentSession,issueSession,sessionCookie,type CurrentSession} from '../../lib/server/auth/sessions';
import {assertDeterministicTestMode} from './runtime';

/** Real principals, memberships and signed sessions in an owned test database.
 * Separate identities keep fixture sends inside the production rate limits. */
export async function isolatedChatActor(db:Client|PoolClient,kind:'internal'|'partner',role:'admin'|'member',workspaceId?:string,previous?:CurrentSession){
 assertDeterministicTestMode();
 const rows=(await db.query('SELECT current_database() AS database,environment_id FROM turas_environment')).rows;
 if(rows.length!==1||!/^turas_test(?:_|$)/.test(String(rows[0].database))||!String(rows[0].environment_id).startsWith('test-')||rows[0].environment_id!==process.env.TURAS_TEST_ENVIRONMENT_ID)throw Error('Owned test database required for an isolated chat identity');
 const identity=previous??{principalId:randomUUID(),membershipId:randomUUID(),workspaceId:workspaceId??randomUUID(),loginName:'fixture-'+randomUUID(),displayName:'Synthetic chat actor',kind,role};
 if(!previous){
  if(!workspaceId)await db.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic isolated chat workspace')",[identity.workspaceId]);
  await db.query('INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,$3)',[identity.principalId,identity.loginName,identity.displayName]);
  const partnerOrgId=kind==='partner'?randomUUID():null;
  if(partnerOrgId)await db.query("INSERT INTO partner_organizations(id,workspace_id,name) VALUES($1,$2,'Synthetic isolated partner')",[partnerOrgId,identity.workspaceId]);
  await db.query('INSERT INTO memberships(id,principal_id,workspace_id,kind,role,partner_org_id) VALUES($1,$2,$3,$4,$5,$6)',[identity.membershipId,identity.principalId,identity.workspaceId,kind,role,partnerOrgId]);
 }
 const issued=await issueSession(identity);
 const actor=await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:sessionCookie(issued.token,issued.expiresAt).split(';')[0]}}));
 if(!actor)throw Error('Isolated signed chat session unavailable');return actor;
}
