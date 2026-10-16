import {describe,it,expect} from 'vitest';
import {retainedChatMessages,type RetainedChatEvent} from '../../lib/conversations/retained-history';
const event=(eventId:string,eventType:string,payload:Record<string,unknown>):RetainedChatEvent=>({eventId,eventType,payload});
describe('application-owned retired conversation history',()=>{
 it('preserves repeated turns and Markdown while keeping files metadata-only',()=>{
  const first=event('u1','message.received',{message:'question',parts:[{type:'text',text:'question'},{type:'file',filename:'image.png',mediaType:'image/png',size:42,url:'https://example.com/private',data:'secret'}]});
  const answer=event('a1','message.completed',{message:'**Answer** with [source](https://example.com/source).'});
  const input=[first,answer,event('u2','message.received',{message:'question'}),answer];
  const before=JSON.stringify(input),messages=retainedChatMessages(input);
  expect(messages.map(m=>m.role)).toEqual(['user','assistant','user']);
  expect(messages[0].parts[1]).toEqual({type:'file',filename:'image.png',mediaType:'image/png',size:42});
  expect(messages[1].parts).toEqual([{type:'text',text:'**Answer** with [source](https://example.com/source).'}]);
  expect(JSON.stringify(input)).toBe(before);
 });
 it('removes generated content after context changes and never presents tool or approval payloads',()=>{
  const events=[event('u','message.received',{message:'question'}),event('a','message.completed',{message:'answer'}),event('p','message.appended',{messageDelta:'partial',partial:true}),event('t','tool.completed',{message:'tool secret'}),event('approval','input.requested',{message:'approval secret'})];
  expect(retainedChatMessages(events,false).map(m=>m.id)).toEqual(['u']);
  expect(retainedChatMessages(events).map(m=>[m.id,m.partial])).toEqual([['u',false],['a',false],['p',true]]);
 });
 it('does not duplicate raw deltas or render arbitrary tool parts',()=>{
  expect(retainedChatMessages([event('d','message.appended',{messageDelta:'delta'}),event('t','message.received',{parts:[{type:'tool',text:'private'}]}),event('a','message.completed',{message:'complete'})])).toEqual([{id:'a',role:'assistant',parts:[{type:'text',text:'complete'}],partial:false}]);
 });
});
