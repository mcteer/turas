import {expect,it} from 'vitest';
import {composeOrdinaryMessage,splitOrdinaryMessage} from '../../lib/conversations/ordinary-documents';
import {parseAttachmentMessage} from '../../lib/conversations/attachment-text';
it('retains extracted-document framing and restores mixed native drafts without exposing envelopes as prompt text',()=>{
 const extracted={filename:'notes.txt',mediaType:'text/plain',text:'Unverified supplied notes.',truncated:true};
 const text=composeOrdinaryMessage('Discuss these notes.',[extracted]);expect(typeof text).toBe('string');
 expect(parseAttachmentMessage(text as string)).toEqual({prompt:'Discuss these notes.',documents:[extracted]});
 const image={type:'file' as const,filename:'pixel.png',mediaType:'image/png',data:'data:image/png;base64,eA=='};
 const mixed=composeOrdinaryMessage('Discuss both files.',[extracted,image]);
 expect(Array.isArray(mixed)).toBe(true);expect(splitOrdinaryMessage(mixed)).toEqual({prompt:'Discuss both files.',documents:[extracted,image]});
});
it('refuses oversized prompts, combined batches and native payloads before any dispatch',()=>{
 const image={type:'file' as const,filename:'pixel.png',mediaType:'image/png',data:'data:image/png;base64,eA=='};
 expect(()=>composeOrdinaryMessage('界'.repeat(5462),[image])).toThrow();
 expect(()=>composeOrdinaryMessage('Read these.',Array.from({length:6},()=>image))).toThrow();
 expect(()=>composeOrdinaryMessage('Read this.',[{...image,data:'data:image/png;base64,'+'A'.repeat(3*1024*1024)}])).toThrow();
});
