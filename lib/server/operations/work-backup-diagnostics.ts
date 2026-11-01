export type WorkBackupStage = 'archive-admission' | 'pricing' | 'source-admission' |
  'cadence' | 'archive-expiry' | 'capture' | 'cold-copy' | 'settlement' | 'health' |
  'capture-preflight' | 'capture-connect' | 'capture-source-roles' | 'capture-checkpoint' |
  'capture-ledger' | 'capture-object-requirements' | 'capture-objects' |
  'capture-manifest' | 'capture-encrypt' | 'capture-receipt' | 'capture-cleanup' |
  'capture-native-preflight' | 'capture-native-assets' | 'capture-native-source' |
  'capture-native-destination' | 'capture-native-source-identity' | 'capture-native-trust' |
  'capture-native-version' | 'capture-native-dump' | 'capture-native-verification';
const stages = new WeakMap<object, WorkBackupStage>();
export function recordWorkBackupFailure(error: unknown, stage: WorkBackupStage) {
  // The first inner boundary is more precise than an outer capture/handler catch.
  if (error !== null && typeof error === 'object' && !stages.has(error)) stages.set(error, stage);
}
const reasons: Readonly<Record<string, string>> = Object.freeze({
  'Backup metadata exceeds operator bound': 'object-capacity',
  'Backup metadata request allowance exceeded': 'metadata-request-capacity',
  'Matched encrypted archive allowance exceeded': 'archive-capacity',
  'Native snapshot dump incomplete': 'database-dump',
  'Immutable native client root required': 'native-assets',
  'Native client bytes differ': 'native-assets',
  'Immutable native client manifest required': 'native-assets',
  'Exact native client inventory required': 'native-assets',
  'Native client library alias differs': 'native-assets',
  'Unlisted native client asset': 'native-assets',
  'Immutable native client directory required': 'native-assets',
  'Unlisted native client library or binary': 'native-assets',
  'Compatible Linux PostgreSQL 18 execution required': 'native-platform',
  'Explicit verified backup source required': 'native-source',
  'Actual native dump source differs': 'native-source',
  'Private native dump destination required': 'native-destination',
  'Native PostgreSQL version differs': 'native-version',
  'Native dump exceeded its bound': 'database-dump-capacity',
  'Native dump destination unavailable': 'database-dump-destination',
  'Native dump byte inventory differs': 'database-dump-integrity',
  'Native dump truncated': 'database-dump-integrity',
  'Native dump changed': 'database-dump-integrity',
  'Root-controlled system trust required': 'native-trust',
  'Object checkpoint byte allowance exceeded': 'object-capacity',
  'Object checkpoint integrity differs': 'object-integrity',
  'Object capture inventory changed': 'object-inventory-changed',
  'Required object ledger identity collision': 'object-identity',
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
