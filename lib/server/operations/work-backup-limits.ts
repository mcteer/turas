/** Bounded expanded work capture. Database dumps retain their separate 64 MiB
 * ceiling. Legacy configurations keep their original 24 MiB object allowance. */
export const WORK_BACKUP_LIMITS = Object.freeze({
  legacyObjectBytes: 25_165_824,
  objectBytes: 201_326_592,
  encryptedArchiveBytes: 335_544_320,
  maximumRetainedBytes: 6_442_450_944,
  legacyRetainedBytes: 419_430_400,
  maximumObjects: 256,
  maximumListRequests: 640,
  legacyListRequests: 32,
  maximumReadRequests: 1280,
});
export type WorkBackupConfigurationVersion = 'pilot-work-backup-config-v1' | 'pilot-work-backup-config-v2';
export function workBackupListLimit(version: WorkBackupConfigurationVersion = 'pilot-work-backup-config-v1') {
  return version === 'pilot-work-backup-config-v2'
    ? WORK_BACKUP_LIMITS.maximumListRequests : WORK_BACKUP_LIMITS.legacyListRequests;
}
