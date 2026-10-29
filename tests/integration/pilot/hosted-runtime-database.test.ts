import {it,expect} from 'vitest';
import {Client,type QueryResultRow} from 'pg';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {assertPilotDatabaseOnConnection} from '../../../lib/server/db/readiness';
it('checks the explicitly supplied runtime without borrowing the selected connection or owner',async()=>{
 await withPilotEnvironment(async env=>{
  const runtime=new Client({connectionString:requireOwnedPilotDatabase()}),owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});
  const reader=(db:Client)=><Row extends QueryResultRow=QueryResultRow>(sql:string,values:readonly unknown[]=[])=>db.query<Row>(sql,[...values]);
  try{
   await runtime.connect();await owner.connect();
   await expect(assertPilotDatabaseOnConnection(env.environmentId,reader(runtime))).resolves.toBeUndefined();
   await expect(assertPilotDatabaseOnConnection('different-environment',reader(runtime))).rejects.toThrow('Database unavailable');
   await expect(assertPilotDatabaseOnConnection(env.environmentId,reader(owner))).rejects.toThrow('Database unavailable');
   await owner.query('GRANT INSERT ON operations_recovery_quarantines TO turas_runtime');
   try{await expect(assertPilotDatabaseOnConnection(env.environmentId,reader(runtime))).rejects.toThrow('Database unavailable');}finally{await owner.query('REVOKE INSERT ON operations_recovery_quarantines FROM turas_runtime');}
   await expect(assertPilotDatabaseOnConnection(env.environmentId,reader(runtime))).resolves.toBeUndefined();
  }finally{await runtime.end();await owner.end();}
 },{postgresMajor:18,deadlineMs:120000});
},150000);
