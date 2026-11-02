import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {readUnsentChatDraft,saveUnsentChatDraft} from '../../app/_components/unsent-chat-draft';
const conversation='12345678-1234-4234-8234-123456789abc',csrf='a'.repeat(64);
let values:Map<string,string>;
beforeEach(()=>{values=new Map();vi.stubGlobal('sessionStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});});
afterEach(()=>vi.unstubAllGlobals());
it('recovers text only for the same tab login and conversation, without storing plaintext or dispatch authority',async()=>{
 const text='An unsent synthetic draft with a Unicode character: ✓';
 await saveUnsentChatDraft(conversation,csrf,text);
 const stored=[...values.values()][0];expect(stored).not.toContain(text);
 expect(Object.keys(JSON.parse(stored)).sort()).toEqual(['data','iv','version']);
 expect(await readUnsentChatDraft(conversation,csrf)).toBe(text);
 const key=[...values.keys()][0];values.set(key.replace(conversation,'different-conversation'),stored);
 expect(await readUnsentChatDraft('different-conversation',csrf)).toBeNull();
 expect(await readUnsentChatDraft(conversation,'b'.repeat(64))).toBeNull();
});
it('does not let a late encryption overwrite a newer draft or restore text after send',async()=>{
 await Promise.all([saveUnsentChatDraft(conversation,csrf,'Older text'),saveUnsentChatDraft(conversation,csrf,'Newer text')]);
 expect(await readUnsentChatDraft(conversation,csrf)).toBe('Newer text');
 const pending=saveUnsentChatDraft(conversation,csrf,'Must remain cleared');
 await saveUnsentChatDraft(conversation,csrf,'');await pending;
 expect(await readUnsentChatDraft(conversation,csrf)).toBeNull();
});
it('discards damaged or oversized storage and does not persist excessive drafts',async()=>{
 await saveUnsentChatDraft(conversation,csrf,'Valid text');const key=[...values.keys()][0];
 values.set(key,'invalid json');expect(await readUnsentChatDraft(conversation,csrf)).toBeNull();
 values.set(key,'x'.repeat(100001));expect(await readUnsentChatDraft(conversation,csrf)).toBeNull();
 await saveUnsentChatDraft(conversation,csrf,'x'.repeat(16385));expect(values.size).toBe(0);
});
