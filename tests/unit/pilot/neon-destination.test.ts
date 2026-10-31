import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {neonArchiveDestinationSchema,verifyWorkNeonDestination} from '../../../scripts/pilot-neon-archive';
const fixture=()=>({contract:'pilot-neon-operator-config-v1',teamId:'team_synthetic',operatorProject:'synthetic-recovery-operator',operatorProjectId:'prj_recovery',sourceProjectId:'prj_source',resourceId:'synthetic-resource',resourceName:'synthetic-recovery',neonProjectId:'synthetic-neon',installationId:randomUUID(),maximumBytes:209715200,databaseUrl:'postgresql://synthetic:synthetic@ep-synthetic.us-east-1.aws.neon.tech/neondb?sslmode=verify-full'});
it('accepts an explicit separate bounded Neon recovery destination',()=>{expect(neonArchiveDestinationSchema.parse(fixture()).maximumBytes).toBe(209715200);});
it('rejects an application project used as its own archive operator project',()=>{const value=fixture();value.operatorProjectId=value.sourceProjectId;expect(()=>neonArchiveDestinationSchema.parse(value)).toThrow();});
it('rejects non Neon insecure or missing explicit archive transport',()=>{for(const databaseUrl of ['postgresql://synthetic@localhost/neondb?sslmode=verify-full','postgresql://synthetic@ep-synthetic.us-east-1.aws.neon.tech/neondb?sslmode=require','postgresql://synthetic@ep-synthetic.us-east-1.aws.neon.tech/neondb','https://synthetic.neon.tech/'])expect(()=>neonArchiveDestinationSchema.parse({...fixture(),databaseUrl})).toThrow();});
it('rejects unbounded archive capacity and arbitrary command fields',()=>{for(const extra of [{maximumBytes:419430401},{maximumBytes:0},{command:'deploy'},{query:'DROP SCHEMA public CASCADE'}])expect(()=>neonArchiveDestinationSchema.parse({...fixture(),...extra})).toThrow();});

function actualMetadata(value:ReturnType<typeof fixture>,plan:string,change:Record<string,unknown>={}){
 return async(args:string[])=>{
  if(args[1]==='/v2/teams')return {teams:[{id:value.teamId,slug:'synthetic-team'}]};
  if(args[0]==='integration-resource')return {resource:{id:value.resourceId,ownership:'owned',status:'available',billingPlan:{id:plan,scope:'installation'},projects:[{id:value.operatorProjectId}],...change}};
  if(args[1].includes('/env?'))return {envs:[{id:'neon-id',key:'TURAS_ARCHIVE_NEON_PROJECT_ID',contentHint:{storeId:value.resourceId}},{id:'connection-id',key:'TURAS_ARCHIVE_DATABASE_URL_UNPOOLED',contentHint:{storeId:value.resourceId}}]};
  if(args[1].includes('/env/neon-id?'))return {decrypted:true,value:value.neonProjectId};
  if(args[1].includes('/env/connection-id?'))return {decrypted:true,value:value.databaseUrl};
  return {id:value.operatorProjectId,name:value.operatorProject,accountId:value.teamId};
 };
}

it('preserves Free-only v1 and binds v2 to the actual inspected resource plan',async()=>{
 const value=fixture(),legacy=neonArchiveDestinationSchema.parse(value),explicit=neonArchiveDestinationSchema.parse({...value,contract:'pilot-neon-operator-config-v2',billingPlanId:'launch_v3'}),signal=AbortSignal.timeout(1000);
 expect((await verifyWorkNeonDestination(legacy,signal,actualMetadata(value,'free_v3'))).plan).toBe('free_v3');
 await expect(verifyWorkNeonDestination(legacy,signal,actualMetadata(value,'launch_v3'))).rejects.toThrow('billing plan');
 expect((await verifyWorkNeonDestination(explicit,signal,actualMetadata(value,'launch_v3'))).plan).toBe('launch_v3');
 await expect(verifyWorkNeonDestination(explicit,signal,actualMetadata(value,'free_v3'))).rejects.toThrow('billing plan');
});

it('rejects missing unknown or drifting v2 plans and retains resource attachment and capacity boundaries',async()=>{
 const value=fixture(),base={...value,contract:'pilot-neon-operator-config-v2',billingPlanId:'launch_v3'},signal=AbortSignal.timeout(1000);
 for(const change of [{billingPlanId:undefined},{billingPlanId:'unknown'},{billingPlanId:'scale_v3'},{maximumBytes:419430401},{operatorProjectId:value.sourceProjectId},{spendingApproved:true}])expect(()=>neonArchiveDestinationSchema.parse({...base,...change})).toThrow();
 const explicit=neonArchiveDestinationSchema.parse(base);
 for(const change of [{billingPlan:{id:'scale_v3'}},{id:'foreign-resource'},{projects:[{id:value.sourceProjectId}]},{projects:[{id:value.operatorProjectId},{id:value.sourceProjectId}]},{ownership:'external'}])await expect(verifyWorkNeonDestination(explicit,signal,actualMetadata(value,'launch_v3',change))).rejects.toThrow();
});

it('binds expanded archive capacity to an explicitly inspected Launch destination',async()=>{
 const value=fixture(),expanded=neonArchiveDestinationSchema.parse({...value,contract:'pilot-neon-operator-config-v3',billingPlanId:'launch_v3',maximumBytes:6442450944}),signal=AbortSignal.timeout(1000);expect((await verifyWorkNeonDestination(expanded,signal,actualMetadata(value,'launch_v3'))).plan).toBe('launch_v3');for(const change of [{contract:'pilot-neon-operator-config-v2'},{billingPlanId:'free_v3'},{maximumBytes:6442450945}])expect(()=>neonArchiveDestinationSchema.parse({...expanded,...change})).toThrow();await expect(verifyWorkNeonDestination(expanded,signal,actualMetadata(value,'free_v3'))).rejects.toThrow('billing plan');
});
