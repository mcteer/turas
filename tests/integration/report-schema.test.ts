import {Client} from 'pg';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import {withReportsDatabase} from '../fixtures/reports/environment';
import {insertReportRevisionFixture} from '../fixtures/reports/revision';
import {describe,it,expect} from 'vitest';
import {requireOwnedReportsDatabase} from '../fixtures/reports/environment';
import {withReportsTestEnvironment} from '../../scripts/reports-test-environment';
const currentSchemaVersion=JSON.parse(readFileSync('migrations/manifest.json','utf8')).version;
export const reportTables=['report_scopes','report_revisions','report_revision_payloads','report_dependencies','report_calculations','report_artifacts','report_validations','report_decisions','report_brand_profiles','report_command_receipts','report_publications','report_senders','report_recipient_policies','report_policy_recipients','report_schedules','report_deliveries','report_delivery_attempts','report_delivery_events','report_jobs','report_cleanup_jobs'];
describe('report schema isolation and immutability',()=>{
  it('creates scoped tables and restricts runtime mutation',async()=>{
    await requireOwnedReportsDatabase();const db=new Client({connectionString:process.env.TURAS_TEST_DATABASE_URL});await db.connect();
    try {
      expect((await db.query('SELECT schema_version FROM turas_environment')).rows[0].schema_version).toBe(currentSchemaVersion);
      expect((await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(row=>row.tablename)).toEqual(expect.arrayContaining(reportTables));
      for(const name of ['report_revisions','report_revision_payloads','report_dependencies','report_calculations','report_validations','report_decisions','report_publications','report_command_receipts','report_delivery_attempts','report_delivery_events']) {
        expect((await db.query("SELECT has_table_privilege('turas_runtime',$1,'UPDATE') AS u,has_table_privilege('turas_runtime',$1,'DELETE') AS d",[name])).rows[0]).toEqual({u:false,d:false});
      }
      expect((await db.query("SELECT has_table_privilege('turas_report_cleanup','report_revision_payloads','DELETE') AS d")).rows[0].d).toBe(false);
    }finally{await db.end();}
  });
  it('blocks in-place payload changes even for the migration owner',async()=>withReportsDatabase(async db=>{
    await db.query('BEGIN');try{
      const fixture=await insertReportRevisionFixture(db);
      await db.query('SAVEPOINT immutable');
      await expect(db.query("UPDATE report_revision_payloads SET document='{}' WHERE revision_id=$1",[fixture.revisionId])).rejects.toMatchObject({code:'23514'});
      await db.query('ROLLBACK TO SAVEPOINT immutable');
      expect((await db.query('SELECT document FROM report_revision_payloads WHERE revision_id=$1',[fixture.revisionId])).rows[0].document).toEqual({synthetic:true});
      const other=randomUUID();
      await db.query("INSERT INTO report_scopes(id,environment_id,workspace_id,customer_id,kind,audience,timezone,from_date,to_date,engagement_ids,workload_ids,include_customer_level,scope_digest,owner_membership_id) SELECT $2,environment_id,workspace_id,$3,kind,audience,timezone,from_date,to_date,engagement_ids,workload_ids,include_customer_level,$4,owner_membership_id FROM report_scopes WHERE id=$1",[fixture.reportId,other,DEMO_IDS.deniedCustomer,'2'.repeat(64)]);
      await db.query('SAVEPOINT scoped');
      await expect(db.query('UPDATE report_scopes SET current_revision_id=$1 WHERE id=$2',[fixture.revisionId,other])).rejects.toMatchObject({code:'23503'});
      await db.query('ROLLBACK TO SAVEPOINT scoped');
    }finally{await db.query('ROLLBACK');}
  }));
  it.each([undefined,38] as const)('explicitly initializes and upgrades owned schema %s',async initialSchemaVersion=>{
    await withReportsTestEnvironment(async environment=>{
      await requireOwnedReportsDatabase();const db=new Client({connectionString:process.env.TURAS_TEST_DATABASE_URL});await db.connect();
      try {
        const prior=(await db.query('SELECT name FROM turas_migrations ORDER BY name')).rows;
        if(initialSchemaVersion)expect((await db.query('SELECT schema_version FROM turas_environment')).rows[0].schema_version).toBe(38);
        await environment.upgrade();
        expect((await db.query('SELECT schema_version FROM turas_environment')).rows[0].schema_version).toBe(currentSchemaVersion);
        expect((await db.query('SELECT name FROM turas_migrations ORDER BY name')).rows.slice(0,prior.length)).toEqual(prior);
      }finally{await db.end();}
    },{empty:true,initialSchemaVersion,sourceDatabaseUrl:process.env.TURAS_TEST_SOURCE_DATABASE_URL});
  },180000);
});
