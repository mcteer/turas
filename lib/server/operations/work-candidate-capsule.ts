import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {workCaptureCandidateSchema} from '../../contracts/pilot-capture';
import {recoveryDigest} from '../../contracts/pilot-recovery';
const magic=Buffer.from('T016META'),digest=z.string().regex(/^[a-f0-9]{64}$/);
function context(archiveId:string,candidateDigest:string){z.uuid().parse(archiveId);digest.parse(candidateDigest);return Buffer.from(recoveryDigest({contract:'pilot-work-candidate-capsule-v1',archiveId,candidateDigest}),'hex');}
export function sealWorkCandidate(raw:unknown,key:Uint8Array){
 if(key.byteLength!==32)throw Error('Separate capsule key required');const candidate=workCaptureCandidateSchema.parse(raw),plain=Buffer.from(JSON.stringify(candidate));if(plain.byteLength>1048576-68)throw Error('Work candidate capsule exceeds bound');
 const nonce=randomBytes(12),header=Buffer.concat([magic,nonce,context(candidate.id,recoveryDigest(candidate))]),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(header);
 try{return Buffer.concat([header,cipher.update(plain),cipher.final(),cipher.getAuthTag()]);}finally{plain.fill(0);}
}
export function unsealWorkCandidate(bytes:Buffer,key:Uint8Array,expected:{archiveId:string;candidateDigest:string}){
 if(key.byteLength!==32||bytes.length<68||bytes.length>1048576||!bytes.subarray(0,8).equals(magic)||!bytes.subarray(20,52).equals(context(expected.archiveId,expected.candidateDigest)))throw Error('Work candidate capsule context differs');
 const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(8,20));decipher.setAAD(bytes.subarray(0,52));decipher.setAuthTag(bytes.subarray(-16));let plain:Buffer|undefined;
 try{plain=Buffer.concat([decipher.update(bytes.subarray(52,-16)),decipher.final()]);const candidate=workCaptureCandidateSchema.parse(JSON.parse(plain.toString('utf8')));if(candidate.id!==expected.archiveId||recoveryDigest(candidate)!==expected.candidateDigest)throw Error('Work candidate capsule metadata differs');return candidate;}finally{plain?.fill(0);}
}
