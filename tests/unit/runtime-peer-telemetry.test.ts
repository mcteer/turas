import {tracingChannel} from 'node:diagnostics_channel';
import {describe,expect,it} from 'vitest';
import {generateText,streamText,type Telemetry} from 'ai';
import {MockLanguageModelV4} from 'ai/test';
import {z} from 'zod';
import {contentFreeModelTelemetry} from '../../lib/server/models/telemetry';

const privateInput='synthetic-private-customer-evidence';
const privateOutput='synthetic-private-research-answer';
const privateMetadata='synthetic-private-provider-payload';
const privateToolInput='synthetic-private-tool-input';
const privateToolOutput='synthetic-private-tool-output';
const toolCall={type:'tool-call' as const,toolCallId:'synthetic-tool-1',toolName:'research_fixture',input:JSON.stringify({value:privateToolInput})};
const usage={inputTokens:{total:5,noCache:5,cacheRead:0,cacheWrite:0},outputTokens:{total:2,text:2,reasoning:0}};
const finishReason={unified:'stop' as const,raw:'stop'};

// Capture at the actual SDK diagnostic boundary, including raw tracing results
// and errors. An integration-only test would miss Node subscriber disclosure.
function capture(){
 const events:unknown[]=[];
 const channel=tracingChannel('ai:telemetry');
 const record=(value:unknown)=>{events.push(JSON.parse(JSON.stringify(value,(_key,item)=>item instanceof Error?{name:item.name,message:item.message}:item)));};
 const handlers={start:record,end:record,asyncStart:record,asyncEnd:record,error:record};
 channel.subscribe(handlers);
 const integration:Telemetry={onStart:record,onEnd:record,onError:record,onLanguageModelCallStart:record,onLanguageModelCallEnd:record};
 return {events,integration,close:()=>channel.unsubscribe(handlers)};
}

describe('installed runtime peer telemetry privacy',()=>{
 for(const streaming of [false,true])it(`withholds content while preserving caller results (stream=${streaming})`,async()=>{
  const observed=capture();
  try{
   const model=new MockLanguageModelV4({
    doGenerate:{content:[{type:'text',text:privateOutput},toolCall],request:{body:privateMetadata},response:{body:privateMetadata},usage,finishReason,warnings:[],providerMetadata:{gateway:{cost:'0.000001',privateMetadata}}},
    doStream:async()=>({stream:new ReadableStream({start(c){
     c.enqueue({type:'text-start',id:'text-1'});c.enqueue({type:'text-delta',id:'text-1',delta:privateOutput});c.enqueue({type:'text-end',id:'text-1'});
     c.enqueue(toolCall);c.enqueue({type:'finish',usage,finishReason,providerMetadata:{gateway:{cost:'0.000001',privateMetadata}}});c.close();
    }})}),
   });
   const options={model,prompt:privateInput,maxRetries:0,tools:{research_fixture:{description:'Synthetic private tool',inputSchema:z.object({value:z.string()}),execute:async({value}:{value:string})=>{expect(value).toBe(privateToolInput);return privateToolOutput;}}},telemetry:{...contentFreeModelTelemetry,integrations:observed.integration}};
   if(streaming){const result=streamText(options);expect(await result.text).toBe(privateOutput);expect((await result.toolResults)[0]?.output).toBe(privateToolOutput);expect((await result.totalUsage).inputTokens).toBe(5);expect((await result.providerMetadata)?.gateway.privateMetadata).toBe(privateMetadata);}
   else {const result=await generateText(options);expect(result.text).toBe(privateOutput);expect(result.toolResults[0]?.output).toBe(privateToolOutput);expect(result.totalUsage.inputTokens).toBe(5);expect(result.providerMetadata?.gateway.privateMetadata).toBe(privateMetadata);}
   expect(observed.events.length).toBeGreaterThan(4);
   const serialized=JSON.stringify(observed.events);
   for(const marker of [privateInput,privateOutput,privateMetadata,privateToolInput,privateToolOutput])expect(serialized).not.toContain(marker);
   expect(serialized).toContain('inputTokens');
  }finally{observed.close();}
 });
 for(const streaming of [false,true])it(`sanitizes diagnostic errors while preserving caller errors (stream=${streaming})`,async()=>{
  const observed=capture();
  try{
   const failure=new Error(privateMetadata);
   const model=new MockLanguageModelV4({doGenerate:async()=>{throw failure;},doStream:async()=>{throw failure;}});
   const options={model,prompt:privateInput,maxRetries:0,telemetry:{...contentFreeModelTelemetry,integrations:observed.integration}};
   if(streaming){const errors:unknown[]=[];const result=streamText({...options,onError:({error})=>{errors.push(error);}});await result.consumeStream();expect(errors).toContain(failure);}
   else await expect(generateText(options)).rejects.toBe(failure);
   expect(observed.events.length).toBeGreaterThan(0);
   const serialized=JSON.stringify(observed.events);
   expect(serialized).not.toContain(privateInput);expect(serialized).not.toContain(privateMetadata);
   expect(serialized).toContain('AI SDK operation failed');
  }finally{observed.close();}
 });
});
