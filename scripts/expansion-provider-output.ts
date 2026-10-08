import {expansionAdviceResultSchema} from '../lib/expansion/advice';
import {expansionHash} from '../lib/server/expansion/commands';
export function expansionProviderFinishReason(raw:unknown){const reason=typeof raw==='object'&&raw!==null?'unified' in raw?raw.unified:null:raw;return typeof reason==='string'&&['stop','length','tool-calls','content-filter','error','other','unknown'].includes(reason)?reason:'unknown';}
export function captureExpansionProviderOutput(text:string,reason:unknown){if(expansionProviderFinishReason(reason)!=='stop'||Buffer.byteLength(text)>65536)return null;try{const result=expansionAdviceResultSchema.safeParse(JSON.parse(text));return result.success?{output:result.data,digest:expansionHash(result.data)}:null;}catch{return null;}}
