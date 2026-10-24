import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool,type PoolClient } from 'pg';
import { z } from 'zod';
import { readEvidence } from './pilot-evidence';
import { DEMO_IDS } from '../lib/server/bootstrap-ids';
const uuid=z.uuid();
export const pilotProvisionSchema=z.object({version:z.literal('pilot-provision-v1'),environmentId:z.string().min(1).max(256),workspaceId:uuid,provisioningId:uuid,
 memberships:z.array(z.object({principalId:uuid,membershipId:uuid,kind:z.enum(['internal','partner']),role:z.enum(['admin','member']),partnerOrganizationId:uuid.optional()}).strict()).min(1).max(25),
 customers:z.array(z.object({id:uuid,label:z.string().trim().min(1).max(150)}).strict()).max(250),
 grants:z.array(z.object({id:uuid,membershipId:uuid,customerId:uuid}).strict()).max(2500)}).strict().superRefine((v,c)=>{
 for(const list of [v.memberships.map(m=>m.principalId),v.memberships.map(m=>m.membershipId),v.customers.map(m=>m.id),v.grants.map(m=>m.id),v.grants.map(g=>g.membershipId+g.customerId)])if(new Set(list).size!==list.length)c.addIssue({code:'custom',message:'Duplicate provisioning identity'});
 for(const m of v.memberships)if((m.kind==='partner')!==Boolean(m.partnerOrganizationId)||m.kind==='partner'&&m.role==='admin')c.addIssue({code:'custom',message:'Invalid membership'});
 if(!v.memberships.some(m=>m.principalId===DEMO_IDS.mcteer&&m.kind==='internal'&&m.role==='admin'))c.addIssue({code:'custom',message:'Canonical administrator required'});
 for(const g of v.grants)if(!v.memberships.some(m=>m.membershipId===g.membershipId&&m.kind==='partner')||!v.customers.some(x=>x.id===g.customerId))c.addIssue({code:'custom',message:'Grant outside manifest'});
});
/** Owner-only; the invoking operator supplies the reviewed manifest, never an HTTP caller. */
export async function provisionPilotWorkspace(db:PoolClient,input:unknown){
 const v=pilotProvisionSchema.parse(input);await db.query('BEGIN');try{
 await db.query("SET LOCAL transaction_timeout='30s'");await db.query("SET LOCAL lock_timeout='2s'");
 const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows;
 const owner=(await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='workspaces'::regclass")).rows[0];
 if(!owner?.owner||marker.length!==1||marker[0].environment_id!==v.environmentId||Number(marker[0].schema_version)!==79)throw Error('Exact owner/schema/environment required');
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['pilot-provision:'+v.environmentId]);
 const existing=(await db.query("SELECT id,classification,pilot_environment_id,pilot_provisioning_id,active FROM workspaces WHERE id=$1 OR (classification='synthetic_pilot' AND pilot_environment_id=$2 AND active) FOR UPDATE",[v.workspaceId,v.environmentId])).rows;
 if(existing.some(w=>w.id!==v.workspaceId||w.classification!=='synthetic_pilot'||w.pilot_environment_id!==v.environmentId||w.pilot_provisioning_id!==v.provisioningId||!w.active))throw Error('Workspace provisioning conflict');
 const principals=(await db.query('SELECT id FROM principals WHERE id=ANY($1::uuid[]) AND active FOR SHARE',[v.memberships.map(m=>m.principalId)])).rows;
 if(principals.length!==v.memberships.length)throw Error('Existing active principals required');
 await db.query("INSERT INTO workspaces(id,name,classification,pilot_environment_id,pilot_provisioning_id) VALUES($1,'Synthetic Pilot · Test Data','synthetic_pilot',$2,$3) ON CONFLICT(id) DO NOTHING",[v.workspaceId,v.environmentId,v.provisioningId]);
 for(const m of v.memberships){
 if(m.partnerOrganizationId){await db.query("INSERT INTO partner_organizations(id,workspace_id,name) VALUES($1,$2,'Synthetic Pilot Partner') ON CONFLICT(id) DO NOTHING",[m.partnerOrganizationId,v.workspaceId]);const org=(await db.query('SELECT workspace_id,active FROM partner_organizations WHERE id=$1 FOR SHARE',[m.partnerOrganizationId])).rows[0];if(org?.workspace_id!==v.workspaceId||!org.active)throw Error('Partner organization conflict');}
 await db.query('INSERT INTO memberships(id,principal_id,workspace_id,kind,role,partner_org_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(principal_id,workspace_id) DO NOTHING',[m.membershipId,m.principalId,v.workspaceId,m.kind,m.role,m.partnerOrganizationId??null]);
 const row=(await db.query('SELECT * FROM memberships WHERE principal_id=$1 AND workspace_id=$2 FOR UPDATE',[m.principalId,v.workspaceId])).rows[0];if(row.id!==m.membershipId||row.kind!==m.kind||row.role!==m.role||row.partner_org_id!==(m.partnerOrganizationId??null)||!row.active)throw Error('Membership conflict; revoked assignments are not restored');
 }
 for(const customer of v.customers){const name='Synthetic Pilot · '+customer.label;await db.query('INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,$3,true) ON CONFLICT(id) DO NOTHING',[customer.id,v.workspaceId,name]);const row=(await db.query('SELECT workspace_id,display_name,synthetic FROM customer_references WHERE id=$1 FOR SHARE',[customer.id])).rows[0];if(row.workspace_id!==v.workspaceId||row.display_name!==name||!row.synthetic)throw Error('Customer conflict');}
 for(const g of v.grants){await db.query("INSERT INTO customer_grants(id,membership_id,workspace_id,customer_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5) ON CONFLICT(membership_id,customer_id) DO NOTHING",[g.id,g.membershipId,v.workspaceId,g.customerId,DEMO_IDS.mcteer]);const row=(await db.query('SELECT id,workspace_id,state FROM customer_grants WHERE membership_id=$1 AND customer_id=$2 FOR UPDATE',[g.membershipId,g.customerId])).rows[0];if(row.id!==g.id||row.workspace_id!==v.workspaceId||row.state!=='active')throw Error('Grant conflict; revoked grants are not restored');}
 await db.query('COMMIT');return {workspaceId:v.workspaceId,memberships:v.memberships.length,customers:v.customers.length,grants:v.grants.length};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{if(process.argv.length!==4||!process.env.DATABASE_URL_UNPOOLED||!process.env.TURAS_ENVIRONMENT_ID)throw Error('Explicit private manifest and owner connection required');const input=pilotProvisionSchema.parse(await readEvidence(resolve(process.argv[2]),process.argv[3]));if(input.environmentId!==process.env.TURAS_ENVIRONMENT_ID)throw Error('Target mismatch');const pool=new Pool({connectionString:process.env.DATABASE_URL_UNPOOLED,max:1});try{const db=await pool.connect();try{await provisionPilotWorkspace(db,input);console.log('Synthetic pilot provisioned; accepted facts and release readiness remain separate');}finally{db.release();}}finally{await pool.end();}}catch{console.error('Pilot provisioning refused; inspect the explicit target and private manifest');process.exitCode=2;}
}
