const checks = [
  'Native learning auth required', 'Native learning session binding failed',
  'Native stream exceeds fixture bound', 'Native output cap missing',
  'Native learning history retained private prose',
  'All three governed reads must execute before cumulative input withholding',
  'Native accounting coverage mismatch', 'Learning native history must remain closed',
  'Native retention probe needs a positive encrypted-payload control',
  'Real native save must replay once', 'Native draft cannot publish itself',
  'Source loss must immediately withhold a real native capture',
  'Real native evaluation must require human review', 'Real evaluation arms must use no tools',
  'Each evaluation arm needs a fresh private native session',
  'Hosted cleanup needs a retained revoked-hash positive control',
  'Actual hosted adapter must retire all owned native sessions',
  'Actual disabled hosted adapter must purge revoked MCP hashes',
  'Hosted cleanup must retain exact create/revoke receipts',
  'Every real native session requires its exact retirement receipt',
  'Governed paired captures must survive native retirement', 'Learning native source changed',
] as const;
export function learningNativeAssertion(message: string) {
  // Return only checked-in assertion identities, never exception text or captures.
  const dispatch=/^Native learning dispatch denied \((\d{3}); ([a-z_]{1,80})\)$/.exec(message);
  if(dispatch&&Number(dispatch[1])>=400&&Number(dispatch[1])<=599)return {kind:'learning-native-assertion' as const,check:'native-dispatch-denied',status:Number(dispatch[1]),code:dispatch[2]};
  const check = checks.find(value => value === message)
    ?? (/^Native (normal|malformed|unknown|overrun|forbidden|all_reads) terminal state mismatch \(/.test(message) ? 'native-terminal-state'
      : /^Native paired arm (?:[1-9]|1[0-6]) incomplete \(/.test(message) ? 'native-paired-arm'
      : /^Retired native storage retains \d+ payload-bearing records$/.test(message) ? 'native-payload-retention' : 'unknown');
  return { kind: 'learning-native-assertion' as const, check };
}
export function readLearningNativeAssertion(value: unknown) {
  if (!value || typeof value !== 'object' || !('kind' in value) || value.kind !== 'learning-native-assertion' || !('check' in value) || typeof value.check !== 'string') return null;
  if(value.check==='native-dispatch-denied'&&'status' in value&&typeof value.status==='number'&&Number.isInteger(value.status)&&value.status>=400&&value.status<=599&&'code' in value&&typeof value.code==='string'&&/^[a-z_]{1,80}$/.test(value.code))return {kind:'learning-native-assertion' as const,check:value.check,status:value.status,code:value.code};
  const allowed = [...checks, 'native-terminal-state', 'native-paired-arm', 'native-payload-retention', 'unknown'];
  return allowed.includes(value.check) ? {kind:'learning-native-assertion' as const,check:value.check} : null;
}
