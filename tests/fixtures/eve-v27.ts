import {SessionStore,type SessionStreamEvent} from 'eve/client';
import type {Fact} from 'eve/events';

export const fixtureAt='2026-11-01T12:00:00.000Z';
export class EveFixture {
 readonly events:SessionStreamEvent[]=[];
 private lines: {at:string;facts:readonly Fact[]}[]=[];
 commit(...facts:Fact[]){
  const line=this.lines.length;this.lines.push({at:fixtureAt,facts});
  facts.forEach((fact,index)=>this.events.push({...fact,meta:{at:fixtureAt,position:{line,index},endOfLine:index===facts.length-1}}));
  return this;
 }
 get body(){return this.lines.map(line=>JSON.stringify(line)).join('\n')+'\n';}
 get snapshot(){return new SessionStore({initialSession:{sessionId:'wrun_synthetic',streamIndex:0},initialEvents:this.events}).snapshot;}
}
export function turnFixture(turnId='turn_0'){
 return new EveFixture().commit(
  {type:'session.started',data:{}},
  {type:'delivery.admitted',data:{deliveryId:'delivery_0',principal:{id:'owned',type:'user'}}},
  {type:'turn.started',data:{turnId,cause:{deliveryId:'delivery_0'},follows:null}},
  {type:'delivery.consumed',scope:{turnId},data:{deliveryId:'delivery_0',turnId,parts:[{kind:'text',text:'Synthetic original question'}]}},
 );
}
export function replyFixture(text='A supported answer.',turnId='turn_0'){
 return turnFixture(turnId).commit({type:'model.requested',scope:{turnId,runId:'run_0'},data:{runId:'run_0',owner:{turnId}}})
 .commit({type:'model.started',scope:{turnId,runId:'run_0'},data:{runId:'run_0',modelId:'synthetic',attempt:0}})
 .commit({type:'content.completed',scope:{turnId,runId:'run_0'},data:{partId:'part_0',runId:'run_0',kind:'text',phase:'reply',value:text}},
  {type:'model.settled',scope:{turnId,runId:'run_0'},data:{runId:'run_0',outcome:'completed',finishReason:'stop'}},
  {type:'usage.recorded',scope:{turnId,runId:'run_0'},data:{owner:{runId:'run_0'},kind:'model',usage:{inputTokens:12,outputTokens:4,cacheReadTokens:0,cacheWriteTokens:0,costUsd:0.001}}})
 .commit({type:'turn.settled',scope:{turnId},data:{turnId,outcome:'completed',reply:['part_0']}});
}
