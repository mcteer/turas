import {activeObjectNamespaces} from '../storage/inventory';
import {validateObjectKey,environmentObjectId,type PrivateObjects,type ObjectDescriptor,type ObjectNamespace} from '../storage/private-objects';
type MetadataStore=PrivateObjects&{headers(namespace:ObjectNamespace,cursor?:string,limit?:number,signal?:AbortSignal):Promise<{objects:{key:string;sizeBytes:number;createdAt:string}[];cursor?:string}>};
/** Read-only backup scope. Check aggregate metadata before any object download,
 * then bound every provider request across both inventory passes and copying.
 * A provider mutation fails the capture; no automatic retry or write exists. */
export class BoundedWorkBackupObjects implements PrivateObjects{
 private known=new Map<string,{sizeBytes:number;reads:number}>();private bytes=0;private pages=0;private reads=0;
 private environment:string;
 constructor(private source:MetadataStore,environmentId:string,private maximumObjects:number,private maximumBytes:number){
  this.environment=environmentObjectId(environmentId);
  if(!Number.isSafeInteger(maximumObjects)||maximumObjects<1||maximumObjects>256||!Number.isSafeInteger(maximumBytes)||maximumBytes<0||maximumBytes>25165824)throw Error('Exact bounded backup object scope required');
 }
 private admitRead(key:string,expected?:Omit<ObjectDescriptor,'key'>){
  validateObjectKey(key,this.environment);const known=this.known.get(key);
  if(!known||expected&&expected.sizeBytes!==known.sizeBytes||known.reads>=5||this.reads>=1280)throw Error('Backup object request allowance exceeded');
  known.reads++;this.reads++;return known;
 }
 async stat(key:string,signal?:AbortSignal){
  signal?.throwIfAborted();const known=this.admitRead(key),actual=await this.source.stat(key,signal);
  if(!actual||actual.key!==key||actual.sizeBytes!==known.sizeBytes)throw Error('Backup object metadata changed');return actual;
 }
 async stream(key:string,expected?:Omit<ObjectDescriptor,'key'>,signal?:AbortSignal){
  signal?.throwIfAborted();this.admitRead(key,expected);return this.source.stream(key,expected,signal);
 }
 async list(namespace:ObjectNamespace,cursor?:string,limit=100,signal?:AbortSignal){
  signal?.throwIfAborted();if(!activeObjectNamespaces.includes(namespace)||!Number.isSafeInteger(limit)||limit<1||limit>100||cursor&&cursor.length>2048)throw Error('Bounded backup metadata request required');if(++this.pages>32)throw Error('Backup metadata request allowance exceeded');
  const page=await this.source.headers(namespace,cursor,limit,signal);if(page.objects.length>limit)throw Error('Backup metadata page exceeds bound');
  // Validate the complete page before downloading even its first object.
  for(const header of page.objects){
   if(validateObjectKey(header.key,this.environment)!==namespace||!Number.isSafeInteger(header.sizeBytes)||header.sizeBytes<0||header.sizeBytes>10485760)throw Error('Backup metadata unavailable');
   const prior=this.known.get(header.key);
   if(prior){if(prior.sizeBytes!==header.sizeBytes)throw Error('Backup object metadata changed');}
   else{this.bytes+=header.sizeBytes;this.known.set(header.key,{sizeBytes:header.sizeBytes,reads:0});}
   if(this.known.size>this.maximumObjects||this.bytes>this.maximumBytes)throw Error('Backup metadata exceeds operator bound');
  }
  const objects:(ObjectDescriptor&{createdAt:string})[]=[];
  for(const header of page.objects){const actual=await this.stat(header.key,signal);objects.push({...actual,createdAt:header.createdAt});}
  return {objects,...(page.cursor?{cursor:page.cursor}:{})};
 }
 async put(_key:string,_bytes:AsyncIterable<Uint8Array>,_expected:Omit<ObjectDescriptor,'key'>,_signal?:AbortSignal):Promise<ObjectDescriptor>{throw Error('Backup source is read-only');}
 async delete(_key:string):Promise<void>{throw Error('Backup source is read-only');}
}
