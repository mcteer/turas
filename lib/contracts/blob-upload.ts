/** Reject redirects and unexpected destinations before sending private original bytes. */
export function privateUploadUrl(value:unknown,pathname:string):string {
 if(typeof value!=='string'||value.length>16384)throw Error('Private upload URL unavailable');
 const url=new URL(value);
 if(url.origin!=='https://vercel.com'||url.pathname!=='/api/blob/'||url.username||url.password||url.hash||url.searchParams.getAll('pathname').length!==1||url.searchParams.get('pathname')!==pathname)throw Error('Private upload destination differs');
 return url.href;
}
export const privateUploadHeaders={'content-type':'application/octet-stream','x-content-type':'application/octet-stream','x-vercel-blob-access':'private','x-add-random-suffix':'0','x-allow-overwrite':'0'};
