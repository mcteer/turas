import {expect,it} from 'vitest';
import {stageChatHandoff,readChatHandoff} from '../../app/_components/chat-handoff';
it('keeps initial delivery volatile and bound to the exact conversation and login',()=>{
 stageChatHandoff({conversationId:'first',csrfToken:'owner-login',message:'Private initial question',requestKey:'original-key',autoSend:true});
 expect(readChatHandoff('other','owner-login')).toBeUndefined();expect(readChatHandoff('first','other-login')).toBeUndefined();
 const draft=readChatHandoff('first','owner-login')!;expect(draft).toMatchObject({message:'Private initial question',requestKey:'original-key',autoSend:true});
 // Reading during a render does not consume it, including a StrictMode render.
 expect(readChatHandoff('first','owner-login')).toMatchObject({requestKey:'original-key'});
 draft.onConsumed();expect(readChatHandoff('first','owner-login')).toBeUndefined();
});
it('a late previous delivery cannot consume a newer draft or turn source inspection into an automatic send',()=>{
 stageChatHandoff({conversationId:'first',csrfToken:'login',message:'First question',requestKey:'first-key',autoSend:true});const older=readChatHandoff('first','login')!;
 stageChatHandoff({conversationId:'second',csrfToken:'login',message:'Unsent source draft',requestKey:'second-key',autoSend:false});older.onConsumed();
 const newer=readChatHandoff('second','login')!;expect(newer).toMatchObject({message:'Unsent source draft',autoSend:false});newer.onConsumed();expect(readChatHandoff('second','login')).toBeUndefined();
});
