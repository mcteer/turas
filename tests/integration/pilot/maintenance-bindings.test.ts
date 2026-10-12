import {afterAll,it,expect} from 'vitest';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {closeRuntimePool,query} from '../../../lib/server/db/client';
import {createMaintenanceBindings,maintenanceBacklog} from '../../../lib/server/operations/maintenance-bindings';
import {maintenanceClasses,runMaintenanceClass} from '../../../lib/server/operations/maintenance';
requireOwnedPilotDatabase();afterAll(()=>closeRuntimePool());
for(const definition of maintenanceClasses)it(`completes the ${definition.id} maintenance binding under runtime grants`,async()=>{
 const binding=createMaintenanceBindings({cancelDue:async()=> 'settled'}) .find(row=>row.id===definition.id)!;
 expect(binding.enabled).toBe(true);expect(binding.optional).toBe(false);
 await binding.tick({limit:definition.batchLimit,signal:AbortSignal.timeout(30000)});
 expect(await runMaintenanceClass(process.env.TURAS_ENVIRONMENT_ID!,'a'.repeat(40),binding)).toEqual({state:'pass'});
 const state=(await query('SELECT last_started_at,last_completed_at,last_success_at,safe_failure,backlog_count FROM operations_maintenance_status WHERE environment_id=$1 AND class_id=$2',[process.env.TURAS_ENVIRONMENT_ID,definition.id])).rows[0];
 expect(state.last_success_at).not.toBeNull();expect(state.last_completed_at.getTime()).toBeGreaterThanOrEqual(state.last_started_at.getTime());expect(state.safe_failure).toBeNull();
 expect((await maintenanceBacklog(definition.id)).backlog).toBeGreaterThanOrEqual(0);
});
