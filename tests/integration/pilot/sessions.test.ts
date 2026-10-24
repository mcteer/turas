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
afterEach(async()=>{await owner.query("UPDATE memberships SET active=true WHERE id=$1",[pilot.membership]);});
afterAll(()=>owner.end());
const request=(token:string)=>new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:`${sessionCookieName()}=${token}`}});
async function login(selection:"primary"|"pilot"="primary") {const identity=await authenticateDemoPrincipal("mcteer",process.env.TURAS_DEMO_PASSWORD!,selection);expect(identity).not.toBeNull();const issued=await issueSession(identity!);const actor=await getCurrentSession(request(issued.token));expect(actor).not.toBeNull();return actor!;}
it("defaults to the primary membership",async()=>expect((await login()).workspaceId).toBe(DEMO_IDS.workspace));
it("binds an explicitly selected pilot membership",async()=>expect((await login("pilot")).membershipId).toBe(pilot.membership));
it("denies an unassigned workspace",async()=>expect(await authenticateDemoPrincipal("partner",process.env.PARTNER_PASSWORD!,"pilot")).toBeNull());
it("revokes an inactive membership immediately",async()=>{const actor=await login("pilot");await owner.query("UPDATE memberships SET active=false WHERE id=$1",[pilot.membership]);expect(await getCurrentSession(request(actor.token))).toBeNull();});
it("keeps a session stable after a second membership",async()=>{const identity=await authenticateDemoPrincipal("panel",process.env.PANEL_PASSWORD!);const issued=await issueSession(identity!);await owner.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','member') ON CONFLICT(principal_id,workspace_id) DO NOTHING",[randomUUID(),DEMO_IDS.panel,pilot.workspace]);expect((await getCurrentSession(request(issued.token)))?.membershipId).toBe(DEMO_IDS.panelMembership);});
it("rejects an unresolved legacy session",async()=>{const token=createSessionToken();await owner.query("INSERT INTO login_sessions(id,principal_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[randomUUID(),DEMO_IDS.mcteer,hashSessionToken(token)]);expect(await getCurrentSession(request(token))).toBeNull();});
it("logout revokes only the exact session",async()=>{const primary=await login(),synthetic=await login("pilot");await revokeSession(synthetic.sessionId);expect(await getCurrentSession(request(synthetic.token))).toBeNull();expect((await getCurrentSession(request(primary.token)))?.workspaceId).toBe(DEMO_IDS.workspace);const audit=(await owner.query("SELECT workspace_id FROM access_audit WHERE actor_session_id=$1 AND action='logout'",[synthetic.sessionId])).rows;expect(audit).toHaveLength(1);expect(audit[0].workspace_id).toBe(pilot.workspace);});
it("does not transfer conversation ownership across workspaces",async()=>{const primary=await login(),synthetic=await login("pilot");const created=await createOwnedConversation(primary,{requestKey:randomUUID(),title:"Synthetic primary private conversation"});await expect(getOwnedConversation(synthetic,created.conversation.id)).rejects.toThrow();expect((await getOwnedConversation(primary,created.conversation.id)).id).toBe(created.conversation.id);});

it("requires explicit pilot login enablement without changing primary login",async()=>{
 const previous=process.env.TURAS_PILOT_LOGIN_ENABLED;
 try{
  for(const enabled of [undefined,"0"]){
   if(enabled===undefined)delete process.env.TURAS_PILOT_LOGIN_ENABLED;else process.env.TURAS_PILOT_LOGIN_ENABLED=enabled;
   expect(await authenticateDemoPrincipal("mcteer",process.env.TURAS_DEMO_PASSWORD!,"pilot")).toBeNull();
   expect((await authenticateDemoPrincipal("mcteer",process.env.TURAS_DEMO_PASSWORD!))?.workspaceId).toBe(DEMO_IDS.workspace);
  }
  process.env.TURAS_PILOT_LOGIN_ENABLED="1";
  expect((await authenticateDemoPrincipal("mcteer",process.env.TURAS_DEMO_PASSWORD!,"pilot"))?.membershipId).toBe(pilot.membership);
 }finally{if(previous===undefined)delete process.env.TURAS_PILOT_LOGIN_ENABLED;else process.env.TURAS_PILOT_LOGIN_ENABLED=previous;}
});
