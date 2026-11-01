import {describe,it,expect} from 'vitest';
import type {EveMessage} from 'eve/react';
import {activeChatHistory,retainedActiveParts,finalChatHistory} from '../../lib/conversations/active-chat-history';
import type {RetainedChatEvent} from '../../lib/conversations/retained-history';

it('keeps authorized tool activity alongside canonical prose and does not drop nontext parts when splitting steps',()=>{
 const tool={type:'tool',callId:'lookup',name:'get_customer',label:'Get customer',kind:'tool',state:'completed',input:{name:'Synthetic'},output:{found:true},stepIndex:0} as const;
 const live={id:'turn:assistant',role:'assistant',metadata:{turnId:'turn'},parts:[tool,{type:'text',text:'Short placeholder',stepIndex:0},{type:'text',text:'Later live response',stepIndex:1}]} as EveMessage;
 const saved:RetainedChatEvent={eventId:'canonical-answer',eventType:'message.completed',turnId:'turn',stepIndex:0,payload:{message:'Complete canonical answer'}};
 const before=JSON.stringify(live),display=activeChatHistory([live],[saved]);
 expect(display[0]).toMatchObject({kind:'retained',message:{id:'canonical-answer'},activity:[tool]});
 expect(display[1]).toMatchObject({kind:'native',message:{parts:[{type:'text',text:'Later live response',stepIndex:1}]}});
 expect(JSON.stringify(live)).toBe(before);
});
const history:RetainedChatEvent[]=[{eventId:'original',eventType:'message.received',turnId:'turn0',inputAliasEventIds:['alias'],payload:{applicationInputParts:[{type:'text',text:'Original input'},{type:'file',filename:'failed.pdf',mediaType:'application/pdf',size:104}]}},{eventId:'partial_turn0_1',eventType:'message.appended',turnId:'turn0',stepIndex:1,payload:{partial:true,messageDelta:'Interrupted answer'}}];
const user=(id:string,turnId:string)=>({id:id+':user',role:'user',metadata:{turnId},parts:[{type:'text',text:'Original input'}]} as EveMessage);
describe('authorized application history display alongside native messages',()=>{
 it('preserves original failed input/file and partial through empty SDK history and a subsequent new send',()=>{
  const before=JSON.stringify(history),empty=activeChatHistory([],history);
  expect(empty.map(x=>[x.kind,x.message.role])).toEqual([['retained','user'],['retained','assistant']]);
  expect(empty[0].message.parts).toContainEqual({type:'file',filename:'failed.pdf',mediaType:'application/pdf',size:104});
  const next=user('new','turn1');expect(activeChatHistory([next],history).map(x=>x.message.id)).toEqual(['original','partial_turn0_1','new:user']);
  expect(JSON.stringify(history)).toBe(before);
 });
 it('prefers exact canonical or server-recorded alias counterparts and never deduplicates steering by turn or repeated text',()=>{
  const alias=user('alias','turn0'),steer=user('correction','turn0');
  expect(activeChatHistory([alias,steer],history).map(x=>x.message.id)).toEqual(['alias:user','partial_turn0_1','correction:user']);
  const original=user('original','turn0');expect(activeChatHistory([original],history).filter(x=>x.message.role==='user')).toEqual([{kind:'native',message:original}]);
  expect(activeChatHistory([steer],history).filter(x=>x.message.role==='user')).toHaveLength(2);
 });
 it('uses exact turn and text-step association for generated counterparts, not matching content',()=>{
  const assistant={id:'native-answer',role:'assistant',metadata:{turnId:'turn0'},parts:[{type:'text',text:'Interrupted answer continued',stepIndex:1}]} as EveMessage;
  expect(activeChatHistory([assistant],history).map(x=>x.message.id)).toEqual(['original','native-answer']);
  expect(activeChatHistory([{...assistant,metadata:{turnId:'other'}}],history)).toHaveLength(3);
  expect(activeChatHistory([{...assistant,parts:[{type:'text',text:'Interrupted answer',stepIndex:0}]} as EveMessage],history)).toHaveLength(3);
 });
 it('restores only exact event-owned staged links and otherwise retains metadata without URLs or bytes',()=>{
  const saved=activeChatHistory([],history)[0];if(saved.kind!=='retained')throw Error('Missing retained input');
  const reference={eventId:'original',text:'Original input',inlineFileCount:0,fileOrder:[{kind:'staged' as const,index:0}],files:[{filename:'failed.pdf',mediaType:'application/pdf',size:104,url:'/api/conversations/exact/native-uploads/exact'}]};
  expect(retainedActiveParts(saved.message,reference)[1]).toMatchObject({url:reference.files[0].url});
  expect(retainedActiveParts(saved.message,{...reference,files:[{...reference.files[0],size:105}]})).toEqual(saved.message.parts);
  expect(retainedActiveParts(saved.message)).toEqual(saved.message.parts);
 });
});
it('never replaces saved generated prose with an empty or shorter resume placeholder and preserves another live step',()=>{
 const completed:RetainedChatEvent={eventId:'answer',eventType:'message.completed',turnId:'turn0',stepIndex:1,payload:{message:'Complete retained answer'}};
 const assistant=(text:string,stepIndex=1)=>({id:'native',role:'assistant',metadata:{turnId:'turn0'},parts:[{type:'text',text,stepIndex}]} as EveMessage);
 for(const text of ['', '  ','Complete'])expect(activeChatHistory([assistant(text)],[completed])[0]).toMatchObject({kind:'retained',message:{parts:[{type:'text',text:'Complete retained answer'}]}});
 const combined={...assistant('Complete'),parts:[{type:'text',text:'Complete',stepIndex:1},{type:'text',text:'New live step',stepIndex:2}]} as EveMessage;
 const display=activeChatHistory([combined],[completed]);expect(display).toHaveLength(2);expect(display[0].kind).toBe('retained');expect(display[1].message.parts).toEqual([{type:'text',text:'New live step',stepIndex:2}]);
 for(const text of ['', 'Interrupted'])expect(activeChatHistory([assistant(text)],history)[1].kind).toBe('retained');
 expect(activeChatHistory([assistant('Interrupted answer plus continuation')],history)[1].kind).toBe('native');
});
it('refuses another event reference even if every file field matches',()=>{
 const saved=activeChatHistory([],history)[0];if(saved.kind!=='retained')throw Error('Missing saved input');
 expect(retainedActiveParts(saved.message,{eventId:'foreign',fileOrder:[{kind:'staged',index:0}],files:[{filename:'failed.pdf',mediaType:'application/pdf',size:104,url:'/private/foreign'}]})).toEqual(saved.message.parts);
});

it('leaves exact native objects, IDs and multi-step parts untouched when application history is empty',()=>{
 const native={id:'original-assistant',role:'assistant',metadata:{turnId:'governed'},parts:[{type:'text',text:'Step one',stepIndex:0},{type:'text',text:'Step two',stepIndex:1}]} as EveMessage;
 const parts=native.parts,display=activeChatHistory([native],[]);
 expect(display).toHaveLength(1);expect(display[0]).toEqual({kind:'native',message:native});
 expect(display[0].message).toBe(native);expect(display[0].message.parts).toBe(parts);expect(display[0].message.id).toBe('original-assistant');
});

it('preserves historical empty-turn answers without merging another identical answer',()=>{
 const message=(id:string,turnId:string,stepIndex:number):EveMessage=>({id,role:'assistant',metadata:{turnId},parts:[{type:'text',text:'Question answered: Desktop.',stepIndex}]});
 const saved:RetainedChatEvent={eventId:'evt_actual',eventType:'message.completed',turnId:'',stepIndex:0,payload:{message:'Question answered: Desktop.'}};
 const native=[message('archived-assistant','',0)];
 expect(activeChatHistory(native,[saved])).toHaveLength(1);
 native.push(message('another-assistant','turn_other',0));expect(activeChatHistory(native,[saved])).toHaveLength(2);
 native.push(message('next-step','',1));expect(activeChatHistory(native,[saved])).toHaveLength(3);
});
it('preserves distinct canonical archived event IDs even when old turn and step were reused',()=>{
 const native:EveMessage={id:'archived-assistant',role:'assistant',metadata:{turnId:''},parts:[{type:'text',text:'Question answered: Desktop.',stepIndex:0}]};
 const saved=['evt_first','evt_second'].map(eventId=>({eventId,eventType:'message.completed',turnId:'',stepIndex:0,payload:{message:'Question answered: Desktop.'}}));
 const display=activeChatHistory([native],saved);
 expect(display.map(item=>item.message.id)).toEqual(['evt_first','evt_second']);expect(display.every(item=>item.kind==='retained')).toBe(true);
});


describe('quiet final-answer presentation',()=>{
 const question=user('question','turn');
 const answer=(id:string,step:number,text:string)=>({kind:'retained' as const,message:{id,role:'assistant' as const,parts:[{type:'text' as const,text}],partial:false,turnId:'turn',stepIndex:step}});
 it('hides intermediate steps while running and shows the final answer when settled without mutating history',()=>{
  const items=[{kind:'native' as const,message:question},answer('progress',0,'Looking up sources'),answer('final',2,'Supported final answer')];const before=JSON.stringify(items);
  expect(finalChatHistory(items,true).map(x=>x.message.id)).toEqual(['question:user']);
  expect(finalChatHistory(items,false).map(x=>x.message.id)).toEqual(['question:user','final']);expect(JSON.stringify(items)).toBe(before);
 });
 it('preserves prior answers and distinct user corrections while waiting for the latest answer',()=>{
  const items=[{kind:'native' as const,message:question},answer('old',0,'Previous answer'),{kind:'native' as const,message:user('correction','turn')},answer('new',1,'New answer')];
  expect(finalChatHistory(items,true).map(x=>x.message.id)).toEqual(['question:user','old','correction:user']);
 });
 it('selects only the final text step from one native message and keeps its file',()=>{
  const message={id:'answer',role:'assistant',parts:[{type:'reasoning',text:'Private reasoning',stepIndex:0},{type:'text',text:'Progress',stepIndex:0},{type:'text',text:'Final',stepIndex:3},{type:'file',mediaType:'text/plain',filename:'result.txt'}]} as EveMessage;
  expect(finalChatHistory([{kind:'native',message}],false)[0].message.parts).toEqual([{type:'text',text:'Final',stepIndex:3},{type:'file',mediaType:'text/plain',filename:'result.txt'}]);
 });
});
