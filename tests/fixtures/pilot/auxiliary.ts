// Controlled unit artifacts exercise the typed validator; they are never hosted evidence.
import {mkdtemp,realpath} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,basename} from 'node:path';
import {writePilotAuxiliaryRun} from '../../../scripts/pilot-auxiliary-evidence';
import {assessPilotLoad,pilotLoadClasses,pilotLoadProfile,type LoadSample} from '../../../lib/server/operations/load-measurements';
import {writeEvidence} from '../../../scripts/pilot-evidence';
import suites from '../../../scripts/pilot-suites.json';
export async function auxiliaryFixture(options:{missingClass?:boolean;wrongSource?:boolean;ui?:boolean;completeUi?:boolean}={}){
 const directory=await realpath(await mkdtemp(join(tmpdir(),'turas-aux-unit-')));const source={sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64)},environmentMarker='test-pilot-0123456789ab',now=Date.now(),samples:LoadSample[]=pilotLoadClasses.flatMap(classId=>Array.from({length:100},(_,i)=>({classId,actorIndex:i%(pilotLoadProfile.internalOnlyClasses.includes(classId)?15:25),phase:'measured' as const,clientMs:1,admittedMs:1,queueWaitMs:0,quotaWaitMs:0,queryCount:1,result:'available' as const,failureCategory:'none' as const}))),scope={sessions:25,internalSessions:15,assignedPartnerSessions:10,customers:250,eligiblePassages:10000,warmupElapsedMs:120000,measurementElapsedMs:600000,totalElapsedMs:720000,quotaResets:0,providerCalls:0,queryCounts:Object.fromEntries(pilotLoadClasses.map(id=>[id,100]))},assessment=assessPilotLoad(samples,scope);
 const artifacts=options.ui?['summary.json']:['samples.json','measurements.json','completed.json'];
 const uiCaseIds:string[]=[];
 if(options.ui){await writeEvidence(directory,'summary.json',{...source,environmentMarker,passed:40,failed:0,skipped:0,projects:4,acceptance:true});if(options.completeUi)for(const project of suites.ui.projects){
 const specs=suites.ui.files.flatMap(file=>suites.ui.cases[file as keyof typeof suites.ui.cases].map((title,i)=>({id:basename(file)+':'+i,file:basename(file),title,line:i+1,ok:false,tests:[{projectName:project,projectId:project,expectedStatus:'passed',status:'skipped',results:[]}]})));
 uiCaseIds.push(...specs.map(spec=>'pilot.ui.'+project+'.'+spec.id));
 for(const executed of [false,true]){const name=project+(executed?'':'-discovery')+'.json';artifacts.push(name);await writeEvidence(directory,name,{config:{rootDir:'/unit/tests/ui'},errors:[],suites:[{specs:specs.map(spec=>({...spec,ok:executed,tests:spec.tests.map(test=>({...test,status:executed?'expected':'skipped',results:executed?[{status:'passed',retry:0,errors:[]}]:[]}))}))}],stats:{expected:executed?10:0,skipped:executed?0:10,unexpected:0,flaky:0}});}
 }}else{
  await writeEvidence(directory,'samples.json',options.missingClass?samples.filter(row=>row.classId!==pilotLoadClasses[0]):samples);await writeEvidence(directory,'measurements.json',{...source,...(options.wrongSource?{sourceDigest:'f'.repeat(64)}:{}),environmentMarker,...assessment});await writeEvidence(directory,'completed.json',{...source,environmentMarker,pass:true,hostedProof:false});
 }
 const run=await writePilotAuxiliaryRun({directory,environmentMarker,source,startedAt:new Date(now-720000).toISOString(),completedAt:new Date(now).toISOString(),gateId:options.ui?'G12':'G10',caseIds:options.ui?(options.completeUi?uiCaseIds:Array.from({length:40},(_,i)=>'pilot.ui.unit.'+i)):pilotLoadClasses.map(id=>'pilot.load.'+id),artifactNames:artifacts});return {directory,run};
}
