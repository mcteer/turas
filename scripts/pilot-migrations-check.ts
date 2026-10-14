import { withPilotEnvironment } from "./pilot-environment";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { DEMO_IDS } from "../lib/server/bootstrap-ids";
await withPilotEnvironment(async environment=>{
 const client=new Client({connectionString:process.env.DATABASE_URL_UNPOOLED});await client.connect();
 try{
  const workspace=randomUUID();await client.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic ambiguous primary')",[workspace]);
  await client.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','member')",[randomUUID(),DEMO_IDS.panel,workspace]);
  for(const [principal,digest] of [[DEMO_IDS.mcteer,"a".repeat(64)],[DEMO_IDS.panel,"b".repeat(64)]])await client.query("INSERT INTO login_sessions(id,principal_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[randomUUID(),principal,digest]);
 }finally{await client.end();}
 await environment.upgradeToCurrent();
 const repeated=spawnSync(process.execPath,["--experimental-strip-types","scripts/db-migrate.ts"],{cwd:environment.appRoot,env:process.env,encoding:"utf8",timeout:30000});
 if(repeated.status!==0)throw new Error("Repeat forward migration failed");
 const result=spawnSync(process.execPath,["node_modules/vitest/vitest.mjs","run","tests/integration/pilot/migrations.test.ts"],{env:process.env,stdio:"inherit",timeout:60000});
 if(result.status!==0)throw new Error("Pilot migration catalog failed");
},{priorSchema:55});
