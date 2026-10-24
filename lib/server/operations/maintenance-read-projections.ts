import {z} from 'zod';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {acceptedPlanRecoveryDigest} from './recovery-plan-projection';
import type {OwnedMaintenanceRecord} from './owned-maintenance-inventory';
const profileSchema=z.object({customer:z.object({id:z.uuid()}),contextVersion:z.union([z.string().regex(/^\d+$/),z.number().int().nonnegative()]),acceptedFacts:z.array(z.record(z.string(),z.unknown())).max(500),workloads:z.array(z.object({id:z.uuid(),lifecycle:z.string()})).max(500)});
export function profileProjection(value:unknown,record:OwnedMaintenanceRecord){
 const profile=profileSchema.parse(value);if(profile.customer.id!==record.customerId||String(profile.contextVersion)!==record.generation)throw Error('Maintenance profile identity or generation differs');
 const facts=profile.acceptedFacts.map((fact):Record<string,unknown>=>{z.uuid().parse(fact.id);const {quality,...rest}=fact;const stable=quality&&typeof quality==='object'&&!Array.isArray(quality)?Object.fromEntries(Object.entries(quality).filter(([key])=>!['asOf','validUntil'].includes(key))):quality;return {...rest,quality:stable};}).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 return recoveryDigest({customerId:profile.customer.id,contextVersion:String(profile.contextVersion),facts,workloads:profile.workloads.sort((a,b)=>a.id.localeCompare(b.id))});
}
export function planProjection(value:unknown,record:OwnedMaintenanceRecord){
 return acceptedPlanRecoveryDigest(value,{planId:record.recordId,customerId:record.customerId!,revisionId:record.parentId!,generation:record.generation!});
}
export function ordinaryPath(record:OwnedMaintenanceRecord){
 if(record.kind==='profile')return '/api/customers/'+record.customerId+'/profile';
 if(record.kind==='execution')return '/api/execution/engagements/'+record.recordId;
 if(record.kind==='plan')return '/api/plans/'+record.recordId;
 if(record.kind==='artifact')return '/api/artifacts/'+record.recordId+'/original';
 if(record.kind==='report')return '/api/reports/artifacts/'+record.recordId;
 if(record.kind==='workforce')return '/api/staffing/imports/'+record.recordId+'/content';
 return '/api/product-gaps/reports/'+record.parentId+'/exports/'+record.recordId;
}
