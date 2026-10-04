import {createHash} from 'node:crypto';
/** Purpose-scoped UUIDs remain stable for the lifetime of one approved publication. */
export function reportDeliveryIdentity(environmentId:string,publicationId:string,recipientIdentity:string,purpose:'delivery'|'provider'){
 const bytes=createHash('sha256').update(JSON.stringify(['turas-report-v1',purpose,environmentId,publicationId,recipientIdentity])).digest().subarray(0,16);
 bytes[6]=(bytes[6]&0x0f)|0x80;bytes[8]=(bytes[8]&0x3f)|0x80;
 const hex=bytes.toString('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
