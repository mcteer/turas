import {expect,it} from 'vitest';
import {learningNativeCleanupMetadata,learningNativeAssertion,readLearningNativeAssertion} from '../../scripts/learning-native-diagnostics';

it('retains fixed native assertion identities through the composed runner',()=>{
  for(const message of ['Native learning session binding failed','Native learning dispatch denied (503; native_unavailable)','Native normal terminal state mismatch (failed; learning_input_budget)','Native paired arm 16 incomplete (running; none)','Retired native storage retains 3 payload-bearing records']){
    const result=learningNativeAssertion(message);
    expect(result.check).not.toBe('unknown');
    expect(readLearningNativeAssertion({...result,payload:'private content'})).toEqual(result);
  }
});
it('excludes untrusted error prose, source content, arbitrary codes and extra fields',()=>{
  const privateText='private customer postgres://user:secret@host/database';
  expect(learningNativeAssertion(privateText)).toEqual({kind:'learning-native-assertion',check:'unknown'});
  expect(readLearningNativeAssertion({kind:'learning-native-assertion',check:privateText})).toBeNull();
  const diagnostic=learningNativeAssertion(`Native normal terminal state mismatch (${privateText})`);
  expect(diagnostic.check).toBe('native-terminal-state');
  expect(JSON.stringify(diagnostic)).not.toContain(privateText);
  expect(readLearningNativeAssertion({kind:'other',check:'native-terminal-state'})).toBeNull();
  expect(readLearningNativeAssertion({kind:'learning-native-assertion',check:'native-dispatch-denied',status:503,code:privateText})).toBeNull();
  expect(readLearningNativeAssertion({kind:'learning-native-assertion',check:'native-dispatch-denied',status:999,code:'native_unavailable'})).toBeNull();
  const cleanup=learningNativeCleanupMetadata({retiredCount:21,ticks:2,jobs:[{purpose:'evaluation_candidate',mode:'normal',attemptState:'completed',jobState:'pending',attempts:2,nextEligibleInMs:299999,due:true,nativeSessionBound:true,nativeTurnBound:true,dispatchState:'admitted',nativeResponseStatus:202,modelSteps:1,receiptPresent:false,session:'PRIVATE_SESSION',prompt:'PRIVATE_PROMPT'}]});expect(cleanup.jobs[0]).toMatchObject({purpose:'evaluation_candidate',jobState:'pending',attempts:2,nativeResponseStatus:202,nextEligibleInMs:299999});expect(JSON.stringify(cleanup)).not.toContain('PRIVATE_');expect(learningNativeCleanupMetadata(cleanup)).toEqual(cleanup);const unknown=learningNativeCleanupMetadata({jobs:[{purpose:privateText,jobState:privateText,attempts:-1,nextEligibleInMs:Infinity,nativeResponseStatus:privateText}]});expect(unknown.jobs[0]).toMatchObject({purpose:'unknown',jobState:'unknown',attempts:null,nextEligibleInMs:null,nativeResponseStatus:null});
});
