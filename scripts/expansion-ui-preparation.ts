import {requireOwnedExpansionClone} from './expansion-eval-environment';

/** Compile only the routes needed to enter an owned expansion journey. No
 * credentials, mutations, redirects or retries; authenticated assertions still
 * run in the unchanged browser deadline after this bounded preparation. */
export async function prepareOwnedExpansionUi(origin:string,deadlineAt:number){
 requireOwnedExpansionClone();
 const url=new URL(origin);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.origin!==process.env.TURAS_APP_ORIGIN||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!Number.isFinite(deadlineAt)||deadlineAt<=Date.now())throw Error('Exact owned UI preparation target required');
 const customer='00000000-0000-4000-8000-000000000000';
 const routes=[{path:'/login',status:200},{path:'/api/auth/login',status:405},{path:'/s',status:307},{path:`/customers/${customer}/expansion`,status:307},{path:`/api/expansion/customers/${customer}`,status:401},{path:`/api/expansion/customers/${customer}/commands`,status:405}] as const;
 const startedAt=Date.now(),end=Math.min(deadlineAt,startedAt+60000),timings=[];
 for(const route of routes){
  const remaining=end-Date.now();if(remaining<=0)throw Error('Owned UI preparation deadline exceeded');
  const start=Date.now(),response=await fetch(new URL(route.path,url),{method:'GET',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(15000,remaining)))});
  try{
   if(response.status!==route.status)throw Error('Owned UI preparation route failed');
   if(route.status===307){const location=response.headers.get('location');if(!location)throw Error('Owned UI preparation redirect missing');const target=new URL(location,url);if(target.origin!==url.origin||target.pathname!=='/login'||target.username||target.password||target.hash)throw Error('Owned UI preparation redirect differs');}
  }finally{await response.body?.cancel();}
  timings.push({route:route.path.replace(customer,':customer'),status:response.status,durationMs:Date.now()-start});
 }
 return {contract:'expansion-ui-preparation-v1' as const,routes:timings,elapsedMs:Date.now()-startedAt,mutations:0,retries:0};
}
