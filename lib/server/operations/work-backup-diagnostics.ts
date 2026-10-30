export type WorkBackupStage = 'archive-admission' | 'pricing' | 'source-admission' |
  'cadence' | 'archive-expiry' | 'capture' | 'cold-copy' | 'settlement' | 'health';
const stages = new WeakMap<object, WorkBackupStage>();
export function recordWorkBackupFailure(error: unknown, stage: WorkBackupStage) {
  if (error !== null && typeof error === 'object') stages.set(error, stage);
}
const reasons: Readonly<Record<string, string>> = Object.freeze({
  'Backup metadata exceeds operator bound': 'object-capacity',
  'Backup metadata request allowance exceeded': 'metadata-request-capacity',
  'Matched encrypted archive allowance exceeded': 'archive-capacity',
  'Native snapshot dump incomplete': 'database-dump',
  'Immutable native client root required': 'native-assets',
  'Native client bytes differ': 'native-assets',
  'Root-controlled system trust unavailable': 'native-trust',
  'Published work pricing unavailable': 'pricing-unavailable',
  'Published work rate changed or unavailable': 'pricing-changed',
});
/** Fixed classifications only. Never return raw messages, stacks, SQL, URLs,
 * provider bodies, credentials or nested causes to logs or HTTP callers. */
export function workBackupFailureDiagnostic(error: unknown) {
  const value = error !== null && typeof error === 'object' ? error : null;
  const ownValue = (key:string):unknown => {try{const descriptor=value?Object.getOwnPropertyDescriptor(value,key):undefined;return descriptor&&'value' in descriptor?descriptor.value:undefined;}catch{return undefined;}};
  const code=ownValue('code'),message=ownValue('message');
  return {
    stage: value ? stages.get(value) ?? 'handler-preflight' : 'handler-preflight',
    code: typeof code === 'string' && ['42501', '40P01', '55P03', '57014',
      '28P01', '28000', '53300', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOENT',
      'EACCES'].includes(code) ? code : 'unclassified',
    reason: typeof message==='string' && Object.hasOwn(reasons, message) ? reasons[message] : 'unclassified',
  };
}
