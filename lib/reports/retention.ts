/** User-confirmed synthetic-demo policy. Technical identity/link tombstones
 * survive solely for replay protection; this never extends payload retention. */
export const REPORT_RETENTION_POLICY='report-retention-v2' as const;
export const REPORT_AUDIT_RETENTION_DAYS=730;
export function reportAuditExpired(createdAt:Date,now=Date.now()):boolean{
 const created=createdAt.getTime();
 if(!Number.isFinite(created)||!Number.isFinite(now))throw new Error('Invalid audit retention instant');
 return created<=now-REPORT_AUDIT_RETENTION_DAYS*86400000;
}
