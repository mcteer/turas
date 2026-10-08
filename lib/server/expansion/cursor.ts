import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {HttpFailure} from '../../contracts/http';
import {expansionDigest,expansionVersion} from '../../contracts/expansion';
import {getServerConfig} from '../config';
const schema=z.object({version:z.literal(1),binding:expansionDigest,generation:expansionDigest,kind:z.enum(['list','history']),
 offset:expansionVersion.max(1000000),asOf:z.number().int().positive().max(8640000000000000),expiresAt:z.number().int().positive()}).strict()
 .refine(value=>value.expiresAt===value.asOf+300000);
const sign=(encoded:string)=>createHmac('sha256',getServerConfig().TURAS_MAINTENANCE_SECRET).update(`expansion-cursor-v1:${encoded}`).digest();
export function encodeExpansionCursor(input:Omit<z.infer<typeof schema>,'version'|'expiresAt'>){
 const value=schema.parse({...input,version:1,expiresAt:input.asOf+300000}),encoded=Buffer.from(JSON.stringify(value)).toString('base64url');
 return `${encoded}.${sign(encoded).toString('base64url')}`;
}
export function decodeExpansionCursor(raw:string,binding:string,kind:'list'|'history',generation?:string,now=Date.now()){
 try{if(raw.length>4096)throw Error('Invalid cursor');const parts=raw.split('.');if(parts.length!==2)throw Error('Invalid cursor');
  const supplied=Buffer.from(parts[1]!,'base64url'),expected=sign(parts[0]!);if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw Error('Invalid signature');
  const value=schema.parse(JSON.parse(Buffer.from(parts[0]!,'base64url').toString('utf8')));
  if(value.binding!==binding||value.kind!==kind||generation&&value.generation!==generation||value.expiresAt<=now||value.asOf>now)throw Error('Refresh cursor');return value;
 }catch{throw new HttpFailure(409,'cursor_changed','Expansion view changed or expired; refresh it');}
}
