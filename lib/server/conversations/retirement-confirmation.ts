import {z} from 'zod';
export const nativeEndConfirmationBasis='native-end-returned-after-inbox-release' as const;
/** Eve 0.91's end/reset dispatcher waits for the exact owner's inbox release
 * before returning this receipt. This proves retirement, not physical deletion
 * or usage settlement. Never apply this to send/answer acknowledgements. */
export async function confirmNativeEndReceipt(sessionId:string,response:Response){
 if(response.status!==202)return response;
 const receipt=z.object({ok:z.literal(true),sessionId:z.literal(sessionId),deliveryId:z.string().min(1)}).passthrough()
  .safeParse(await response.clone().json().catch(()=>null));
 if(!receipt.success)return response;
 const headers=new Headers(response.headers);headers.delete('content-length');
 return Response.json({...receipt.data,status:'ended',confirmationBasis:nativeEndConfirmationBasis},{status:202,headers});
}
