import {CURRENT_SCHEMA_VERSION} from '../../../lib/contracts/current-schema';
import {assertHistoricalNamedContentRetained} from '../../../lib/server/conversations/named-content';
import { afterAll,afterEach,beforeAll,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { DEMO_IDS } from "../../../lib/server/bootstrap-ids";
import { authenticateDemoPrincipal } from "../../../lib/server/auth/credentials";
import { getCurrentSession,issueSession,sessionCookieName,revokeSession,createSessionToken,hashSessionToken } from "../../../lib/server/auth/sessions";
import { createOwnedConversation,getOwnedConversation } from "../../../lib/server/conversations/repository";
import { requireOwnedPilotDatabase } from "../../../scripts/pilot-environment";
import { ensurePilotWorkspaceFixture } from "../../fixtures/pilot/workspace";
const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});let pilot:{workspace:string;membership:string};
beforeAll(async()=>{await owner.connect();pilot=await ensurePilotWorkspaceFixture(owner);});
afterEach(async()=>{await owner.query("UPDATE memberships SET active=true WHERE id=ANY($1::uuid[])",[[pilot.membership,DEMO_IDS.mcteerMembership]]);});
afterAll(()=>owner.end());
const request=(token:string)=>new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:`${sessionCookieName()}=${token}`}});
async function login(username="mcteer") {const identity=await authenticateDemoPrincipal(username,process.env[username==="panel"?"PANEL_PASSWORD":"TURAS_DEMO_PASSWORD"]!);expect(identity).not.toBeNull();const issued=await issueSession(identity!);const actor=await getCurrentSession(request(issued.token));expect(actor).not.toBeNull();return actor!;}
it("defaults to the primary membership",async()=>expect((await login()).workspaceId).toBe(DEMO_IDS.workspace));
it("rejects both new and retained synthetic membership sessions",async()=>{
 expect(await authenticateDemoPrincipal("mcteer",process.env.TURAS_DEMO_PASSWORD!,"pilot")).toBeNull();
 const primary=await authenticateDemoPrincipal("mcteer",process.env.TURAS_DEMO_PASSWORD!);
 await expect(issueSession({...primary!,membershipId:pilot.membership,workspaceId:pilot.workspace,workspaceClassification:"synthetic_pilot"})).rejects.toMatchObject({status:401});
 const token=createSessionToken();await owner.query("INSERT INTO login_sessions(id,principal_id,token_hash,expires_at,membership_id,workspace_id) VALUES($1,$2,$3,now()+interval '1 hour',$4,$5)",[randomUUID(),DEMO_IDS.mcteer,hashSessionToken(token),pilot.membership,pilot.workspace]);
 expect(await getCurrentSession(request(token))).toBeNull();
 expect(await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!+'/api/operations/status',{headers:{cookie:`${sessionCookieName()}=${token}`}}),'operations-status')).toBeNull();
 expect(await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!+'/api/auth/logout',{method:'POST',headers:{cookie:`${sessionCookieName()}=${token}`}}),'session-revocation')).toBeNull();
});
it("denies an unassigned workspace",async()=>expect(await authenticateDemoPrincipal("partner",process.env.PARTNER_PASSWORD!,"pilot")).toBeNull());
it("revokes an inactive membership immediately",async()=>{const actor=await login();await owner.query("UPDATE memberships SET active=false WHERE id=$1",[DEMO_IDS.mcteerMembership]);expect(await getCurrentSession(request(actor.token))).toBeNull();});
it("keeps a session stable after a second membership",async()=>{const identity=await authenticateDemoPrincipal("panel",process.env.PANEL_PASSWORD!);const issued=await issueSession(identity!);await owner.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','member') ON CONFLICT(principal_id,workspace_id) DO NOTHING",[randomUUID(),DEMO_IDS.panel,pilot.workspace]);expect((await getCurrentSession(request(issued.token)))?.membershipId).toBe(DEMO_IDS.panelMembership);});
it("rejects an unresolved legacy session",async()=>{const token=createSessionToken();await owner.query("INSERT INTO login_sessions(id,principal_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[randomUUID(),DEMO_IDS.mcteer,hashSessionToken(token)]);expect(await getCurrentSession(request(token))).toBeNull();});
it("logout revokes only the exact session",async()=>{const primary=await login(),synthetic=await login();await revokeSession(synthetic.sessionId);expect(await getCurrentSession(request(synthetic.token))).toBeNull();expect((await getCurrentSession(request(primary.token)))?.workspaceId).toBe(DEMO_IDS.workspace);const audit=(await owner.query("SELECT workspace_id FROM access_audit WHERE actor_session_id=$1 AND action='logout'",[synthetic.sessionId])).rows;expect(audit).toHaveLength(1);expect(audit[0].workspace_id).toBe(DEMO_IDS.workspace);});
it("does not transfer primary conversation ownership across principals",async()=>{const primary=await login(),synthetic=await login("panel");const created=await createOwnedConversation(primary,{requestKey:randomUUID(),title:"Synthetic primary private conversation"});await expect(getOwnedConversation(synthetic,created.conversation.id)).rejects.toThrow();expect((await getOwnedConversation(primary,created.conversation.id)).id).toBe(created.conversation.id);for(const schemaVersion of [80,CURRENT_SCHEMA_VERSION+1]){await owner.query('BEGIN');try{await owner.query('UPDATE turas_environment SET schema_version=$1',[schemaVersion]);await expect(assertHistoricalNamedContentRetained(owner as never,primary,created.conversation.id)).rejects.toMatchObject({status:503,code:'evidence_history_unavailable'});}finally{await owner.query('ROLLBACK');}}expect((await owner.query('SELECT schema_version FROM turas_environment')).rows[0].schema_version).toBe(CURRENT_SCHEMA_VERSION);});

it("keeps retired pilot login disabled without changing primary login",async()=>{
 const previous=process.env.TURAS_PILOT_LOGIN_ENABLED;
 try{
  for(const enabled of [undefined,"0"]){
   if(enabled===undefined)delete process.env.TURAS_PILOT_LOGIN_ENABLED;else process.env.TURAS_PILOT_LOGIN_ENABLED=enabled;
   expect(await authenticateDemoPrincipal("mcteer",process.env.TURAS_DEMO_PASSWORD!,"pilot")).toBeNull();
   expect((await authenticateDemoPrincipal("mcteer",process.env.TURAS_DEMO_PASSWORD!))?.workspaceId).toBe(DEMO_IDS.workspace);
  }
  process.env.TURAS_PILOT_LOGIN_ENABLED="1";
  expect(await authenticateDemoPrincipal("mcteer",process.env.TURAS_DEMO_PASSWORD!,"pilot")).toBeNull();
 }finally{if(previous===undefined)delete process.env.TURAS_PILOT_LOGIN_ENABLED;else process.env.TURAS_PILOT_LOGIN_ENABLED=previous;}
});
