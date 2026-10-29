/** Fixed hosted runtime descriptor. URL options cannot override operator bounds. */
export function hostedRuntimeConnection(raw:string|undefined){
 if(!raw)throw Error('Explicit hosted runtime database required');const url=new URL(raw);
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname.endsWith('.neon.tech')||decodeURIComponent(url.username)!=='turas_runtime_016'||!url.password||!url.pathname.slice(1)||url.pathname.slice(1).includes('/')||url.hash||url.port&&!['5432'].includes(url.port)||url.searchParams.get('sslmode')!=='verify-full'||url.searchParams.getAll('sslmode').length!==1||url.searchParams.getAll('channel_binding').length>1||url.searchParams.has('channel_binding')&&url.searchParams.get('channel_binding')!=='require'||[...url.searchParams.keys()].some(key=>!['sslmode','channel_binding'].includes(key)))throw Error('Exact bounded Neon verify-full runtime descriptor required');
 return url.href;
}
