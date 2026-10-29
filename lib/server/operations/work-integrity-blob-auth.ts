import{privateBlobAuth,type PrivateBlobAuth}from'../storage/blob-auth';
/** Explicit operator credentials only. The pinned SDK and Blob service verify
 * access; a decoded JWT never supplies authorization. No local/env fallback. */
export function workIntegrityBlobAuth(storeId:string,credentials:{oidcToken?:string;blobToken?:string}):PrivateBlobAuth{
 const hasOidc=credentials.oidcToken!==undefined,hasToken=credentials.blobToken!==undefined;
 if(hasOidc===hasToken)throw Error('Exactly one explicit private Blob credential required');
 return privateBlobAuth({NODE_ENV:'production',BLOB_STORE_ID:storeId,VERCEL_BLOB_RETRIES:'0',VERCEL_ENV:'preview',...(hasToken?{BLOB_READ_WRITE_TOKEN:credentials.blobToken}:{VERCEL_OIDC_TOKEN:credentials.oidcToken})});
}
