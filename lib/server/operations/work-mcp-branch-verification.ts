import type {Client} from 'pg';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {mcpCategorySchema} from '../../contracts/mcp';
import {requireAuthenticatedRetainedDenials,requireRetainedWorkDenialContinuation,type RetainedWorkDenials} from '../../../scripts/pilot-denial-reader';
import {withLockedWorkRecoveryDecision,requireLockedWorkRecoveryConnection,withWorkRecoveryReadGroup,retireRegisteredWorkMcpProbe,type LockedWorkRecoveryInput,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import {issueWorkRecoveryMcpProbe} from './recovery-mcp-probe-issuer';
import {deriveWorkMcpScopeInTransaction,walkCategory,openCanonicalSdk,canonicalTool,transcriptEntry,projection,targetDigest,requireOriginalWorkMcpBranchMeasurements,type Selection,type WorkMcpCategoryMeasurement} from './work-mcp-verification';
type Passwords=Record<Selection['username'],string>;
type Row=Readonly<{selection:Readonly<Selection>;transcriptDigest:string;calls:number;branchDigest:string}>;
export type WorkMcpCanonicalScope=Readonly<{contract:'pilot-work-mcp-canonical-scope-v1';targetDigest:string;scopeDigest:string;canonicalDigest:string;measuredAt:string;requiredSelections:number;representatives:readonly Readonly<Selection>[];hostedSdkVerified:false}>;
const measured=new WeakMap<object,{rows:readonly Row[];retained:RetainedWorkDenials}>();
const object=(value:unknown)=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Canonical MCP object required');return value as Record<string,unknown>;};
/** Group only identical observed transport/policy shapes. All exact bytes remain
 * in the separately hashed canonical transcript. Cardinality, pagination, tool
 * sequence and categorical status/policy fields distinguish branches. The
 * dispatcher, authorization implementation and environment-wide storage/runtime
 * configuration are identical at the exact verified build. Customer IDs are
 * arguments to those shared paths, not customer-specific transport backends.
 * A future customer-specific dispatcher/backend must extend this classification
 * or reject this method; response shape alone cannot establish that equivalence. */
function branchShape(value:unknown,key=''):unknown{
 if(Array.isArray(value))return value.map(item=>branchShape(item,key));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([name,item])=>[name,branchShape(item,name)]));
 if(value===null||typeof value==='boolean')return value;
 if(['status','reason','code','kind','state','audience','section','categories','dataCategory','supportStatus','acceptance','conflict','dependencyState','classification','sourceKind','format','origin','projectionVersion','formulaVersion','templateVersion','schemaVersion','contractVersion','operation','result','role','reviewState'].includes(key))return value;
 return typeof value;
}
const participant=(s:Selection)=>recoveryDigest({workspaceId:s.workspaceId,username:s.username});
const roleCategory=(s:Selection)=>recoveryDigest({workspaceId:s.workspaceId,username:s.username,category:s.category});
async function inspect(db:Client,target:LockedWorkRecoveryTarget,passwords:Passwords,retained:RetainedWorkDenials,journalDirectory:string){
 const inventory=await deriveWorkMcpScopeInTransaction(db,target),groups=new Map<string,Selection[]>(),rows:Row[]=[];
 for(const selected of inventory.required){const key=participant(selected),group=groups.get(key)??[];group.push(selected);groups.set(key,group);}
 const chunks:{selected:Selection[];customers:string[]}[]=[];
 for(const group of groups.values()){
  const customers=[...new Set(group.flatMap(s=>s.customerId?[s.customerId]:[]))].sort();
  if(!customers.length)chunks.push({selected:group,customers:[]});
  // Amortize credential issuance without increasing its existing 59s lifetime
  // or the public 100-customer ceiling. Every customer page still has limit20.
  for(let offset=0;offset<customers.length;offset+=60){const ids=customers.slice(offset,offset+60);chunks.push({customers:ids,selected:group.filter(s=>s.customerId?ids.includes(s.customerId):offset===0)});}
 }
 if(chunks.length>32)throw Error('Canonical scope exceeds original finite probe allowance');
 for(const chunk of chunks){
  requireAuthenticatedRetainedDenials(retained,target.environmentId);
  const first=chunk.selected[0],deadline=Math.min(target.deadline,Date.now()+59000),categories=chunk.customers.length?[...mcpCategorySchema.options]:['knowledge' as const];
  const issued=await issueWorkRecoveryMcpProbe(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision,workspaceId:first.workspaceId,username:first.username,password:passwords[first.username],deadline,mcp:{categories,customerIds:chunk.customers,expiresAt:new Date(deadline).toISOString(),retained}},journalDirectory);
  let sdk:Awaited<ReturnType<typeof openCanonicalSdk>>|undefined,failure:unknown;
  try{
   sdk=await openCanonicalSdk(db,target,issued.credential,false);
   const customers:Record<string,unknown>[]=[];let cursor:unknown,firstPage:Record<string,unknown>|undefined;const cursors=new Set<string>();
   if(chunk.customers.length)do{const page=await canonicalTool(sdk,'turas_customers_list_v1',{limit:20,...(cursor?{cursor}:{})});firstPage??=page;if(page.status==='available'){const items=object(page.data).items;if(!Array.isArray(items))throw Error('Canonical customer page required');customers.push(...items.map(object));}cursor=page.nextCursor;if(cursor){if(typeof cursor!=='string'||cursors.has(cursor))throw Error('Canonical customer cursor differs');cursors.add(cursor);}if(customers.length>60||cursors.size>2)throw Error('Canonical customer census exceeds scope');}while(cursor);
   if(JSON.stringify(customers.map(c=>c.customerId).sort())!==JSON.stringify(chunk.customers))throw Error('Exhaustive canonical customer census differs');
   const identity=await canonicalTool(sdk,'turas_identity_v1',{}),identityData=object(identity.data);
   if(identityData.kind!==(first.username==='partner'?'partner':'internal')||identityData.workspaceId!==first.workspaceId||JSON.stringify(identityData.categories)!==JSON.stringify(categories))throw Error('Canonical participant scope differs');
   for(let offset=0;offset<chunk.selected.length;offset+=8){
    const completed=await withWorkRecoveryReadGroup(db,target,chunk.selected.slice(offset,offset+8).map(selected=>async()=>{
     const transcript:string[]=[],branches:unknown[]=[];
     await walkCategory(selected,async(name,args,canonicalArgs=args)=>{
      if(transcript.length>=64)throw Error('Canonical category exceeds original finite call allowance');let value:Record<string,unknown>;
      if(name==='turas_customers_list_v1'){const customer=customers.find(c=>c.customerId===selected.customerId);if(!customer||!firstPage)throw Error('Canonical selected customer missing');value={...firstPage,status:'available',data:{items:[customer]},nextCursor:null};}
      else if(name==='turas_identity_v1')value={...identity,data:{...identityData,categories:[selected.category]}};
      else value=await canonicalTool(sdk!,name,canonicalArgs);
      transcript.push(transcriptEntry(name,args,value));branches.push({name,shape:branchShape(projection(name,value))});return {remote:value,canonical:value};
     });
     return Object.freeze({selection:selected,transcriptDigest:recoveryDigest(transcript),calls:transcript.length,branchDigest:recoveryDigest({participant:participant(selected),category:selected.category,branches})});
    }));rows.push(...completed);
   }
  }catch(error){failure=error;throw error;}
  finally{const failures:unknown[]=[];try{await sdk?.close();}catch(error){failures.push(error);}try{await retireRegisteredWorkMcpProbe(db,target,issued.probe);}catch(error){failures.push(error);}if(failures.length)throw new AggregateError([...(failure?[failure]:[]),...failures],'Canonical scope and original probe retirement incomplete');}
 }
 requireAuthenticatedRetainedDenials(retained,target.environmentId);
 rows.sort((a,b)=>recoveryDigest(a.selection).localeCompare(recoveryDigest(b.selection)));
 return {inventory,rows:Object.freeze(rows),chunks:chunks.length};
}
/** Exhaustive canonical scope is explicitly distinct from hosted SDK evidence.
 * Only actual observations choose the required hosted branch representatives. */
export async function measureWorkMcpCanonicalScope(input:{target:LockedWorkRecoveryInput;passwords:Passwords;retained:RetainedWorkDenials;journalDirectory:string}){
 return withLockedWorkRecoveryDecision(input.target,async(db,target)=>{
  const {inventory,rows}=await inspect(db,target,input.passwords,input.retained,input.journalDirectory),branches=new Map<string,Selection>();for(const row of rows)if(!branches.has(row.branchDigest))branches.set(row.branchDigest,row.selection);
  const proof=Object.freeze({contract:'pilot-work-mcp-canonical-scope-v1' as const,targetDigest:targetDigest(target),scopeDigest:inventory.scopeDigest,canonicalDigest:recoveryDigest(rows),measuredAt:new Date().toISOString(),requiredSelections:rows.length,representatives:Object.freeze([...branches.values()].map(s=>Object.freeze({...s}))),hostedSdkVerified:false as const});
  measured.set(proof,{rows,retained:input.retained});return proof;
 });
}
/** Full canonical replay and genuine hosted branch observations are both
 * mandatory. Neither sampled HTTP nor canonical-only results establish both. */
export async function requireWorkMcpBranchCoverage(db:Client,target:LockedWorkRecoveryTarget,canonical:WorkMcpCanonicalScope,hosted:readonly WorkMcpCategoryMeasurement[],passwords:Passwords,retained:RetainedWorkDenials,journalDirectory:string){
 await requireLockedWorkRecoveryConnection(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
 const actual=measured.get(canonical),age=Date.now()-Date.parse(canonical.measuredAt);
 if(!actual||canonical.targetDigest!==targetDigest(target)||age<0||age>1800000||recoveryDigest(actual.rows)!==canonical.canonicalDigest)throw Error('Genuine exhaustive canonical baseline required');
 requireRetainedWorkDenialContinuation(actual.retained,retained,target.environmentId);
 await requireOriginalWorkMcpBranchMeasurements(db,target,hosted,retained);
 const expected=new Map(canonical.representatives.map(s=>[recoveryDigest(s),s])),observed=new Map<string,WorkMcpCategoryMeasurement>(),canaries=new Map<string,number>();
 for(const proof of hosted){const key=recoveryDigest(proof.selection);if(!expected.has(key)||observed.has(key))throw Error('Exact unique hosted policy branches required');const row=actual.rows.find(r=>recoveryDigest(r.selection)===key);if(!row||row.transcriptDigest!==proof.transcriptDigest||row.calls!==proof.calls)throw Error('Hosted branch differs from exhaustive canonical scope');observed.set(key,proof);const role=roleCategory(proof.selection);canaries.set(role,Math.max(canaries.get(role)??0,Date.parse(proof.completedAt)));}
 if(observed.size!==expected.size||actual.rows.some(row=>(canaries.get(roleCategory(row.selection))??0)<Date.now()-300000))throw Error('Every hosted branch and recent participant/category canary required');
 const current=await inspect(db,target,passwords,retained,journalDirectory);
 if(current.inventory.scopeDigest!==canonical.scopeDigest||recoveryDigest(current.rows)!==canonical.canonicalDigest)throw Error('Exhaustive canonical accepted scope or policy changed');
 return Object.freeze({contract:'pilot-work-mcp-coverage-v2' as const,scopeDigest:canonical.scopeDigest,canonicalDigest:canonical.canonicalDigest,canonicalSelections:current.rows.length,hostedBranches:hosted.length,currentCredentialChunks:current.chunks,exhaustiveCanonicalScopeCoverageVerified:true as const,actualHostedSdkBranchCoverageVerified:true as const,probeRetirementVerified:true as const,restorationReady:false as const});
}
