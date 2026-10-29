import {z} from 'zod';
const timestamp=z.iso.datetime({offset:true});
export const backupScheduleSchema=z.strictObject({
 contract:z.literal('pilot-backup-schedule-v1'),intervalHours:z.literal(12),maximumAgeHours:z.literal(24),retentionDays:z.literal(7),
 deleteOperatorArchives:z.literal(false),deleteIndependentAuthority:z.literal(false),
});
export type BackupSchedule=z.infer<typeof backupScheduleSchema>;
const entrySchema=z.strictObject({id:z.uuid(),environmentId:z.string().min(1).max(256),ownership:z.enum(['managed-016','operator']),capturedAt:timestamp,expiresAt:timestamp,verifiedAt:timestamp.nullable()});
/** Inventory policy only. This never authorizes deletion, restoration or unlock. */
export function assessBackupSchedule(input:{schedule:unknown;environmentId:string;entries:unknown;now:number}){
 const schedule=backupScheduleSchema.parse(input.schedule),entries=z.array(entrySchema).max(100000).parse(input.entries);
 if(!Number.isFinite(input.now)||!input.environmentId||new Set(entries.map(e=>e.id)).size!==entries.length)throw Error('Exact finite backup inventory required');
 if(entries.some(e=>e.environmentId!==input.environmentId||Date.parse(e.capturedAt)>input.now||Date.parse(e.expiresAt)<=Date.parse(e.capturedAt)||e.verifiedAt!==null&&(Date.parse(e.verifiedAt)<Date.parse(e.capturedAt)||Date.parse(e.verifiedAt)>input.now)))throw Error('Backup inventory identity or time differs');
 const managed=entries.filter(e=>e.ownership==='managed-016');
 if(managed.some(e=>Date.parse(e.expiresAt)-Date.parse(e.capturedAt)!==schedule.retentionDays*86400000))throw Error('Managed retention differs');
 const verified=managed.filter(e=>e.verifiedAt!==null).sort((a,b)=>Date.parse(a.capturedAt)-Date.parse(b.capturedAt));
 const latest=verified.at(-1),latestAt=latest?Date.parse(latest.capturedAt):null;
 const observed=verified.length>=2&&verified.every((e,i)=>{if(i===0)return true;const elapsed=Date.parse(e.capturedAt)-Date.parse(verified[i-1].capturedAt);return elapsed>=schedule.intervalHours*3600000&&elapsed<=schedule.maximumAgeHours*3600000;});
 return {contract:'pilot-backup-schedule-assessment-v1' as const,environmentId:input.environmentId,assessedAt:new Date(input.now).toISOString(),
  fresh:latestAt!==null&&input.now-latestAt<=schedule.maximumAgeHours*3600000&&Date.parse(latest!.expiresAt)>input.now,
  observedCaptureSpacing:observed,scheduleExecutionVerified:false,nextDueAt:latestAt===null?null:new Date(latestAt+schedule.intervalHours*3600000).toISOString(),
  scheduleDue:latestAt===null||input.now>=latestAt+schedule.intervalHours*3600000,
  expiredManagedIds:managed.filter(e=>Date.parse(e.expiresAt)<=input.now).map(e=>e.id).sort(),
  retainedOperatorIds:entries.filter(e=>e.ownership==='operator').map(e=>e.id).sort(),
  independentAuthorityRetentionRequired:true,independentAuthorityRetained:false,deletionAuthorized:false,restorationReady:false};
}
