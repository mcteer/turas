import {expect,it} from 'vitest';
import {fileMemory,inMemory} from 'eve/memory/file';

it('saves and recalls scoped preferences while a native file remains in turn history',async()=>{
 const provider=fileMemory({backend:inMemory()});
 const abortSignal=new AbortController().signal;
 const file={type:'file',mediaType:'image/png',data:new URL('data:image/png;base64,c3ludGhldGlj')};
 const context={abortSignal,channel:{kind:'test'},session:{id:'owned-session',auth:{}},
  memory:{scope:{key:'environment/workspace/owner',namespace:'file',value:['environment','workspace','owner']},slot:'file'},
  messages:[{role:'user',content:[file]}],turn:{id:'owned-turn',sequence:0,input:[{role:'user',content:[file]}]},operationId:'owned-operation'};
 const tools=await provider.tools!(context as never);
 await tools!.save_memory.execute!({text:'Prefer concise replies.'},{abortSignal} as never);
 const recalled=await provider.recall['turn.started'](context as never);
 expect(recalled?.messages[0].content).toContain('Prefer concise replies.');
 const other={...context,memory:{...context.memory,scope:{...context.memory.scope,key:'environment/workspace/other-owner'}}};
 expect(await provider.recall['turn.started'](other as never)).toBeNull();
 expect(file.data).toBeInstanceOf(URL);
});
