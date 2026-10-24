import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool,type PoolClient} from 'pg';
import {provisionPilotWorkspace,pilotProvisionSchema} from '../../../scripts/provision-pilot-workspace';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
function manifest(environmentId:string){
 const workspaceId=randomUUID(),membershipId=randomUUID(),partnerMembership=randomUUID(),customerId=randomUUID();
 return {version:'pilot-provision-v1',environmentId,workspaceId,provisioningId:randomUUID(),memberships:[{principalId:DEMO_IDS.mcteer,membershipId,kind:'internal',role:'admin'},{principalId:DEMO_IDS.partner,membershipId:partnerMembership,kind:'partner',role:'member',partnerOrganizationId:randomUUID()}],customers:[{id:customerId,label:'Delivery fixture'}],grants:[{id:randomUUID(),membershipId:partnerMembership,customerId}]};
}
/** One active pilot per environment is intentional. Give provisioning its own
 * owned target instead of removing or relabeling another suite's pilot. */
type ProvisionFixture=ReturnType<typeof manifest>;
async function fixture(run:(db:PoolClient,input:ProvisionFixture)=>Promise<void>){
 await withPilotEnvironment(async environment=>{
  const pool=new Pool({connectionString:requireOwnedPilotDatabase(process.env,true),max:1}),db=await pool.connect();
  try{await run(db,manifest(environment.environmentId));}finally{db.release();await pool.end();}
 },{postgresMajor:18,deadlineMs:120000});
}
it('provisions one explicitly scoped synthetic workspace',async()=>fixture(async(db,manifest)=>{expect(pilotProvisionSchema.safeParse(manifest).success).toBe(true);await provisionPilotWorkspace(db,manifest);const w=(await db.query('SELECT classification,name FROM workspaces WHERE id=$1',[manifest.workspaceId])).rows[0];expect(w).toEqual({classification:'synthetic_pilot',name:'Synthetic Pilot · Test Data'});expect((await db.query('SELECT synthetic FROM customer_references WHERE id=$1',[manifest.customers[0].id])).rows[0].synthetic).toBe(true);}),150000);
it('repeats without duplicating memberships or grants',async()=>fixture(async(db,manifest)=>{await provisionPilotWorkspace(db,manifest);await provisionPilotWorkspace(db,manifest);expect(Number((await db.query('SELECT count(*) FROM memberships WHERE workspace_id=$1',[manifest.workspaceId])).rows[0].count)).toBe(2);expect(Number((await db.query('SELECT count(*) FROM customer_grants WHERE workspace_id=$1',[manifest.workspaceId])).rows[0].count)).toBe(1);await db.query("UPDATE customer_grants SET state='revoked',revision=revision+1 WHERE workspace_id=$1",[manifest.workspaceId]);await expect(provisionPilotWorkspace(db,manifest)).rejects.toThrow('Grant conflict');expect((await db.query('SELECT state FROM customer_grants WHERE workspace_id=$1',[manifest.workspaceId])).rows[0].state).toBe('revoked');}),150000);
it('rejects a mismatched environment',async()=>fixture(async(db,manifest)=>{await expect(provisionPilotWorkspace(db,{...manifest,environmentId:'foreign-environment'})).rejects.toThrow('Exact owner/schema/environment');}),150000);
it('rejects unknown principals and primary overwrites',async()=>fixture(async(db,manifest)=>{await expect(provisionPilotWorkspace(db,{...manifest,memberships:[manifest.memberships[0],{...manifest.memberships[1],principalId:randomUUID()}]})).rejects.toThrow('Existing active principals');await expect(provisionPilotWorkspace(db,{...manifest,workspaceId:DEMO_IDS.workspace})).rejects.toThrow('Workspace provisioning conflict');}),150000);
it('does not create accepted or published facts',async()=>fixture(async(db,manifest)=>{await provisionPilotWorkspace(db,manifest);expect(Number((await db.query('SELECT count(*) FROM profile_revisions WHERE workspace_id=$1',[manifest.workspaceId])).rows[0].count)).toBe(0);expect(Number((await db.query('SELECT count(*) FROM knowledge_contributions WHERE workspace_id=$1',[manifest.workspaceId])).rows[0].count)).toBe(0);}),150000);
