import {expect,it} from 'vitest';
import {learningNativeAssertion,readLearningNativeAssertion} from '../../scripts/learning-native-diagnostics';

it('retains fixed native assertion identities through the composed runner',()=>{
  for(const message of ['Native learning session binding failed','Native normal terminal state mismatch (failed; learning_input_budget)','Native paired arm 16 incomplete (running; none)','Retired native storage retains 3 payload-bearing records']){
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
});
