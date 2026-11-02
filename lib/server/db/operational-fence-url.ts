const descriptor=(value:string)=>{try{return new URL(value);}catch{throw Error('Direct runtime fence target differs');}};
/** Session advisory locks cannot use Neon's transaction pooler. Derive only the
 * matching direct host, keeping the runtime role/password/TLS/options. The owner
 * URL supplies target identity for verification, never connection credentials. */
export function operationalFenceDatabaseUrl(runtimeUrl:string,unpooledDescriptor:string):string{
 const runtime=descriptor(runtimeUrl);
 if(!/^ep-[a-z0-9-]+-pooler\.[a-z0-9.-]+\.neon\.tech$/.test(runtime.hostname))return runtimeUrl;
 const direct=descriptor(unpooledDescriptor);
 // node-postgres query parameters can override URL routing. Do not allow an
 // apparently matching descriptor to redirect this session back to the pooler.
 if([runtime,direct].some(url=>['host','port','database'].some(key=>url.searchParams.has(key))))
  throw Error('Direct runtime fence target differs');
 const hostname=runtime.hostname.replace('-pooler.','.');
 if(hostname!==direct.hostname||(runtime.port||'5432')!==(direct.port||'5432')||runtime.pathname!==direct.pathname)
  throw Error('Direct runtime fence target differs');
 runtime.hostname=hostname;
 return runtime.href;
}
