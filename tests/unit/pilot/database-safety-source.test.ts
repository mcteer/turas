import {pilotDenialSnapshot} from '../../../scripts/pilot-denial-snapshot';
import {mkdtemp,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {workRuntimeRetirementBinding} from '../../../scripts/pilot-work-runtime-retirement';
import {it,expect} from 'vitest';
import {databaseSafetySourceSchema,databaseSafetyCaptureSourceSchema} from '../../../scripts/pilot-database-safety-copy';
import {legacySafetyContextSchema,targetedSafetyContextSchema} from '../../../scripts/pilot-legacy-safety-rehearsal';
import {runNeonSafetyPgDump} from '../../../lib/server/operations/pg-dump';
const fixture=()=>({contract:'pilot-database-safety-source-v1',projectId:'prj_synthetic',environmentId:'production-synthetic',target:'production',schemaVersion:55,connectionBinding:'platform-readable',databaseUrl:'postgresql://synthetic:synthetic@ep-synthetic.us-east-1.aws.neon.tech/neondb?sslmode=verify-full'});
it('binds a database safety source to an explicit supported Production schema',()=>{expect(databaseSafetySourceSchema.parse(fixture()).schemaVersion).toBe(55);expect(databaseSafetySourceSchema.parse({...fixture(),schemaVersion:57}).schemaVersion).toBe(57);});
it('rejects pooled insecure foreign and implicit database safety sources',()=>{for(const databaseUrl of ['postgresql://synthetic@ep-synthetic-pooler.us-east-1.aws.neon.tech/neondb?sslmode=verify-full','postgresql://synthetic@ep-synthetic.us-east-1.aws.neon.tech/neondb?sslmode=require','postgresql://synthetic@localhost/neondb?sslmode=verify-full','postgresql://synthetic@ep-synthetic.us-east-1.aws.neon.tech/neondb'])expect(()=>databaseSafetySourceSchema.parse({...fixture(),databaseUrl})).toThrow();});
it('rejects unknown safety flags alternate targets and unsupported schema claims',()=>{for(const extra of [{target:'preview'},{schemaVersion:56},{schemaVersion:100},{unlock:true},{currentAuthorityVerified:true}])expect(()=>databaseSafetySourceSchema.parse({...fixture(),...extra})).toThrow();});
it('refuses unsafe external dump transport before opening a connection or process',async()=>{for(const connectionString of ['postgresql://synthetic@localhost/neondb?sslmode=verify-full','postgresql://synthetic@ep-synthetic.us-east-1.aws.neon.tech/neondb?sslmode=require','https://synthetic.neon.tech/'])await expect(runNeonSafetyPgDump({environmentId:'synthetic',serverMajor:18,snapshot:'00000001-00000001-1',output:'/not-created/database.dump',connectionString,signal:AbortSignal.timeout(1000)})).rejects.toThrow('verified Neon');});
it('admits explicit Preview capture without broadening Production or mutation source scopes',async()=>{
 const preview={...fixture(),target:'preview',schemaVersion:38};expect(databaseSafetyCaptureSourceSchema.parse(preview)).toMatchObject({target:'preview',schemaVersion:38});
 expect(()=>databaseSafetySourceSchema.parse(preview)).toThrow();expect(()=>databaseSafetyCaptureSourceSchema.parse({...preview,target:'production'})).toThrow();
 const input={contract:'pilot-work-runtime-retirement-v1',projectId:'prj_synthetic',teamId:'team_synthetic',environmentId:'production-synthetic',recoveryId:'00000000-0000-4000-8000-000000000001',controlRevision:1,password:'s'.repeat(43)};
 expect(workRuntimeRetirementBinding({...fixture(),schemaVersion:79},input).scope.target).toBe('production');
 expect(workRuntimeRetirementBinding({...preview,schemaVersion:79},{...input,target:'preview'}).target.target).toBe('preview');
 for(const [source,scope] of [[preview,{...input,target:'preview'}],[{...preview,schemaVersion:77},{...input,target:'preview'}],[{...preview,schemaVersion:79},input],[{...fixture(),schemaVersion:79},{...input,target:'preview'}],[{...preview,schemaVersion:79},{...input,target:'preview',environmentId:'another-synthetic'}]])expect(()=>workRuntimeRetirementBinding(source,scope)).toThrow();
 const root=await mkdtemp(join(await realpath(tmpdir()),'turas-denial-target-'));
 try{
  const sourceFile=join(root,'source.json'),destinationFile=join(root,'destination.json');
  await writeFile(destinationFile,JSON.stringify({contract:'pilot-neon-operator-config-v1',teamId:'team_synthetic',operatorProject:'synthetic-operator',operatorProjectId:'prj_operator',sourceProjectId:'prj_different',resourceId:'synthetic',resourceName:'synthetic',neonProjectId:'synthetic',installationId:input.recoveryId,maximumBytes:1048576,databaseUrl:'postgresql://synthetic:synthetic@ep-archive.us-east-1.aws.neon.tech/neondb?sslmode=verify-full'}));
  // Reach the producer's exact target check for both targets, before any IO.
  for(const target of ['preview','production']){
   await writeFile(sourceFile,JSON.stringify({...fixture(),target,schemaVersion:79}));
   await expect(pilotDenialSnapshot(['--capture-work-denials','--source',sourceFile,'--destination',destinationFile,'--output',join(root,'not-created')])).rejects.toThrow('Exact separate current denial snapshot scope required');
  }
 }finally{await rm(root,{recursive:true,force:true});}
 expect(()=>databaseSafetyCaptureSourceSchema.parse({...preview,schemaVersion:56})).toThrow();expect(()=>databaseSafetyCaptureSourceSchema.parse({...preview,databaseUrl:'postgresql://synthetic@localhost/neondb?sslmode=verify-full'})).toThrow();
});
it('requires target-bound v3 context while retaining exact v2 Production context support',()=>{
 const context={contract:'pilot-database-safety-copy-v2',id:'00000000-0000-4000-8000-000000000001',sourceProjectId:'prj_synthetic',environmentId:'synthetic',schemaVersion:55,capturedAt:new Date().toISOString(),ledgerDigest:'a'.repeat(64),applicationContentDigest:'b'.repeat(64),sourceDatabaseName:'synthetic_database',serverMajor:18,dumpDigest:'c'.repeat(64),dumpBytes:123,matchedServiceCheckpoint:false};
 expect(legacySafetyContextSchema.parse(context).schemaVersion).toBe(55);
 const preview={...context,contract:'pilot-database-safety-copy-v3',sourceTarget:'preview',schemaVersion:38};expect(targetedSafetyContextSchema.parse(preview).sourceTarget).toBe('preview');
 expect(()=>targetedSafetyContextSchema.parse({...preview,sourceTarget:'production'})).toThrow();expect(()=>targetedSafetyContextSchema.parse({...preview,sourceTarget:undefined})).toThrow();expect(()=>legacySafetyContextSchema.parse(preview)).toThrow();
});
