import type {SpecialistKind} from '../../../contracts/specialist-discussions';
const codes=new Set(['MODEL_CALL_FAILED','COMPACTION_FAILED','WORKFLOW_STREAM_WRITE_FAILED','TOOL_EXECUTION_DENIED','specialist_budget_unavailable','specialist_usage_unconfirmed','specialist_dispatch_uncertain','specialist_pricing_unavailable','specialist_unavailable','specialist_conflict','specialist_result_conflict','context_changed','source_changed','not_found','unauthorized','forbidden','authority_changed','40P01','40001','55P03','57014','42501','23514','23505']);
const hints={reply:/eve__reply|final (?:answer|reply)|structured/i,tool:/tool|function.call/i,validation:/schema|validation|invalid|expected|parse|json/i,model:/model|provider|upstream|gateway/i,history:/history|messages|reasoning|tool.result/i,hook:/hook|workflow|replay/i,state:/undefined|null|not a function|already|state/i,empty:/empty|no (?:text|content|output)|did not (?:produce|return)/i};
const names=new Set(['Error','TypeError','ReferenceError','AbortError','TimeoutError','ZodError','AI_APICallError','AI_NoOutputGeneratedError','AI_NoObjectGeneratedError','AI_TypeValidationError','AI_InvalidToolInputError','AI_NoSuchToolError','AI_JSONParseError','AI Gateway model request rejected','Model provider API error']);
const issueCodes=new Set(['invalid_type','invalid_value','invalid_format','invalid_union','invalid_key','invalid_element','not_multiple_of','too_big','too_small','unrecognized_keys','custom']);
const issueTypes=new Set(['string','number','boolean','object','array','null','undefined','date','int']);
const issueFields=new Set(['kind','status','reference','reason','accountId','researchId','sourceIds','product','topic','practices','summary','gaps','rationale','caveat','practice','input','output','data','message','role','content','type']);
function validationMetadata(text:string){
 const signals=['schema','validation','invalid','expected','parse','json'].filter(word=>new RegExp(word,'i').test(text));
 let parsed:unknown;
 try{parsed=JSON.parse(text);}catch{/* Non-JSON error prose stays private. */}
 const issues=Array.isArray(parsed)?parsed:parsed&&typeof parsed==='object'&&Array.isArray((parsed as {issues?:unknown}).issues)?(parsed as {issues:unknown[]}).issues:[];
 return {validationSignals:signals,validationIssues:issues.slice(0,5).flatMap(issue=>{
  if(!issue||typeof issue!=='object')return [];
  const row=issue as Record<string,unknown>;
  if(typeof row.code!=='string'||!issueCodes.has(row.code))return [];
  return [{code:row.code,expected:typeof row.expected==='string'&&issueTypes.has(row.expected)?row.expected:'unknown',
   path:Array.isArray(row.path)?row.path.slice(0,4).map(value=>typeof value==='string'&&issueFields.has(value)?value:typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=12?'index':'other'):[]}];
 })};
}
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
 const details=row.details&&typeof row.details==='object'?row.details as Record<string,unknown>:{};
 const name=typeof details.name==='string'&&names.has(details.name)?details.name:typeof row.name==='string'&&names.has(row.name)?row.name:'unknown';
 const status=[details.statusCode,details.upstreamStatusCode,row.statusCode].find(value=>Number.isInteger(value)&&Number(value)>=400&&Number(value)<=599);
 return {kind:'specialist_failure' as const,specialistKind:kind,stage,code,failureClass,...(stage==='child-result'?{
  errorName:name,httpStatus:status===undefined?null:Number(status),hints:Object.entries(hints).filter(([,pattern])=>pattern.test(text)).map(([name])=>name),...validationMetadata(text),
 }: {})};
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

