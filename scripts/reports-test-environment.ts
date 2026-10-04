import { mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomBytes,randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyOwnedEvalFiles } from './eval-owned-copy';
import { requireOwnedReportsDatabase } from '../tests/fixtures/reports/environment';
import {Client} from 'pg';
import { withPlanEvalEnvironment, type PlanEvalEnvironment, type PlanEvalOptions } from './plan-eval-environment';

/** Owns a marked clone; never migrates the selected application database. */
export async function withReportsTestEnvironment<T>(
  run: (environment: PlanEvalEnvironment & {upgrade:()=>Promise<void>;prepareRuntimeRole:()=>Promise<string>}) => Promise<T>,
  options: Omit<PlanEvalOptions, 'feature' | 'prepare'> & {initialSchemaVersion?:38} = {},
): Promise<T> {
  const runtimeRole=`turas_009_runtime_${randomUUID().replaceAll('-','').slice(0,12)}`;
  let runtimeCreated=false;
  return withPlanEvalEnvironment(async environment=>run({...environment,prepareRuntimeRole:async()=>{
    await requireOwnedReportsDatabase();
    const owner=process.env.DATABASE_URL_UNPOOLED!,url=new URL(owner),password=randomBytes(32).toString('hex');
    const db=new Client({connectionString:owner,connectionTimeoutMillis:5000});await db.connect();
    try{
      if(runtimeCreated)throw new Error('Owned runtime already prepared');
      await db.query(`CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${password}'`);runtimeCreated=true;
      await db.query(`GRANT ${runtimeRole} TO CURRENT_USER WITH SET TRUE`);
      await db.query((await readFile(resolve('scripts/db-role-setup.sql'),'utf8')).replaceAll('turas_runtime',runtimeRole));
    }finally{await db.end();}
    url.username=runtimeRole;url.password=password;return url.toString();
  },upgrade:async()=>{
    await requireOwnedReportsDatabase();
    copyOwnedEvalFiles(resolve('migrations'),join(environment.appRoot,'migrations'));
    for(const file of ['scripts/db-migrate.ts','scripts/db-roles.ts']) {
      const result=spawnSync(process.execPath,['--experimental-strip-types',file],{cwd:environment.appRoot,env:process.env,encoding:'utf8',timeout:120000});
      if(result.error || result.status!==0)throw new Error('Owned reports upgrade failed');
    }
  }}), {...options, feature:'009',
    prepare:async ({appRoot,environmentId}) => {
      if(options.initialSchemaVersion!==undefined) {
        if(!options.empty)throw new Error('Prior schema requires empty owned clone');
        const directory=join(appRoot,'migrations');
        const manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
        manifest.migrations=manifest.migrations.filter((entry:{file:string})=>Number(entry.file.slice(0,3))<=38);
        for(const file of await readdir(directory))if(/^\d{3}-.*\.cjs$/.test(file) && Number(file.slice(0,3))>38)await rm(join(directory,file));
        await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
      }
      const root=join(appRoot,'private-reports');
      await mkdir(root,{mode:0o700});
      await writeFile(join(root,'.turas-report-store.json'),JSON.stringify({environmentId}),{mode:0o600,flag:'wx'});
      return {TURAS_REPORT_STORE_ROOT:root,TURAS_REPORTS_ENABLED:'false',TURAS_REPORT_TEST_MODE:'owned-fixture',
        RESEND_API_KEY:'re_owned_fixture_invalid_key',RESEND_WEBHOOK_SECRET:'whsec_'+randomBytes(32).toString('base64'),
        TURAS_REPORT_SENDER_ADDRESS:'synthetic-sender@example.invalid',TURAS_REPORT_SENDER_ID:randomUUID(),TURAS_REPORT_SENDER_DOMAIN_ID:randomUUID(),
        TURAS_REPORT_RECIPIENT_HMAC_KEYS:JSON.stringify({'owned-v1':randomBytes(32).toString('base64')}),TURAS_REPORT_RECIPIENT_HMAC_KEY_ID:'owned-v1'};
    },
    cleanupGuard:async paths=>{
      if(options.cleanupGuard)await options.cleanupGuard(paths);
      if(!runtimeCreated)return;
      const db=new Client({connectionString:paths.databaseUrl,connectionTimeoutMillis:5000});await db.connect();
      try{
        if(!/^turas_test_009_eval_[a-f0-9]{12}$/.test(paths.databaseName))throw new Error('Owned runtime cleanup refused');
        const marker=(await db.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0]?.marker;
        if(!marker?.startsWith('turas-owned-009-'))throw new Error('Owned runtime cleanup refused');
        await db.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename=$1 AND datname=$2 AND pid<>pg_backend_pid()`,[runtimeRole,paths.databaseName]);
        await db.query(`DROP OWNED BY ${runtimeRole}`);await db.query(`DROP ROLE ${runtimeRole}`);runtimeCreated=false;
      }finally{await db.end();}
    },
  });
}
