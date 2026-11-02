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

/** Owned cleanup state only; no attempt/session IDs, prompts or error prose. */
export function learningNativeCleanupMetadata(value:unknown){
 const row=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const choice=(value:unknown,allowed:readonly string[])=>typeof value==='string'&&allowed.includes(value)?value:'unknown';
 const number=(value:unknown,max:number)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.min(max,Math.trunc(value)):null;
 const jobs=Array.isArray(row.jobs)?row.jobs.slice(0,22).map(value=>{const job=value&&typeof value==='object'?value as Record<string,unknown>:{};return {purpose:choice(job.purpose,['draft','evaluation_baseline','evaluation_candidate']),mode:choice(job.mode,['normal','malformed','unknown','overrun','forbidden','all_reads']),attemptState:choice(job.attemptState,['prepared','admitted','running','completed','failed','cancelled','unconfirmed','invalidated']),jobState:choice(job.jobState,['pending','running','completed','review_required']),attempts:number(job.attempts,4),nextEligibleInMs:number(job.nextEligibleInMs,3600000),due:job.due===true,nativeSessionBound:job.nativeSessionBound===true,nativeTurnBound:job.nativeTurnBound===true,dispatchState:choice(job.dispatchState,['prepared','dispatching','admitted','uncertain','retryable','rejected']),nativeResponseStatus:number(job.nativeResponseStatus,599),modelSteps:number(job.modelSteps,100),receiptPresent:job.receiptPresent===true};}):[];
 return {kind:'learning_native_cleanup_incomplete' as const,retiredCount:number(row.retiredCount,999),expected:22,ticks:number(row.ticks,10),jobs};
}
