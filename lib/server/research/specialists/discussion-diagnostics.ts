import type {SpecialistKind} from '../../../contracts/specialist-discussions';
const codes=new Set(['specialist_budget_unavailable','specialist_usage_unconfirmed','specialist_dispatch_uncertain','specialist_pricing_unavailable','specialist_unavailable','specialist_conflict','specialist_result_conflict','context_changed','source_changed','not_found','unauthorized','forbidden','authority_changed','40P01','40001','55P03','57014','42501','23514','23505']);
/** Exception text may contain private data. Inspect it only to select a fixed
 * category; never return the message, identifiers, stack, cause or raw code. */
export function specialistFailureMetadata(kind:SpecialistKind,stage:'model-admission'|'child-result'|'publish'|'workflow',error:unknown){
 try{
 const row=error&&typeof error==='object'?error as Record<string,unknown>:{};
 const code=typeof row.code==='string'&&codes.has(row.code)?row.code:'unknown';
 const text=typeof error==='string'?error.slice(0,8192):typeof row.message==='string'?row.message.slice(0,8192):'';
 const failureClass=/specialist allowance|specialist_budget|budget.*exhaust/i.test(text)?'allowance':
  /prior specialist usage|usage.*unconfirmed/i.test(text)?'usage_unconfirmed':
  /source.*changed|context.*changed|no longer eligible/i.test(text)?'context':
  /timed? out|timeout|expired/i.test(text)?'deadline':
  /resource not found|authority.*unavailable|unauthorized|sign in again/i.test(text)?'authority':
  /output.*schema|structured.*(?:output|result)|schema.*validation|not match.*schema|no (?:object|output) generated/i.test(text)?'output_contract':
  /rate.*limit|too many.*requests/i.test(text)?'rate':
  /ECONN|network|socket|fetch failed|gateway|provider|service unavailable/i.test(text)?'provider':'unknown';
 return {kind:'specialist_failure' as const,specialistKind:kind,stage,code,failureClass};
 }catch{return {kind:'specialist_failure' as const,specialistKind:kind,stage,code:'unknown',failureClass:'unknown'};}
}
/** Only terminal enums and booleans cross this boundary; never log a reply. */
export function logSpecialistChildResult(kind:SpecialistKind,result:{status:'completed'|'failed'|'cancelled';sessionEnded:boolean;error?:unknown},signalAborted:boolean){
 try{console.warn(JSON.stringify({...specialistFailureMetadata(kind,'child-result',result.error),kind:'specialist_child_result',status:result.status,sessionEnded:result.sessionEnded,signalAborted}));}catch{/* Diagnostics cannot replace settlement. */}
}
/** Diagnostic failure must never replace the primary failure. Workflow logs can
 * repeat on replay; these are observations, never accounting or dispatch proof. */
export function logSpecialistFailure(kind:SpecialistKind,stage:Parameters<typeof specialistFailureMetadata>[1],error:unknown){
 try{console.warn(JSON.stringify(specialistFailureMetadata(kind,stage,error)));}catch{/* Preserve the original failure even if a logger is unavailable. */}
}

