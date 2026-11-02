import {it,expect} from 'vitest';
import {confirmNativeEndReceipt,nativeEndConfirmationBasis} from '../../lib/server/conversations/retirement-confirmation';
it('retains the native delivery identity and confirms only a matching synchronous end return',async()=>{
 const response=await confirmNativeEndReceipt('wrun_owned',Response.json({ok:true,sessionId:'wrun_owned',deliveryId:'end_delivery'},{status:202}));
 expect(response.status).toBe(202);expect(await response.json()).toEqual({ok:true,sessionId:'wrun_owned',deliveryId:'end_delivery',status:'ended',confirmationBasis:nativeEndConfirmationBasis});
});
it.each([{status:500,body:{ok:false}},{status:202,body:{ok:true}},{status:202,body:{ok:true,sessionId:'wrun_foreign',deliveryId:'end_delivery'}}])('never turns an unknown, failed, or foreign return into terminal proof: %j',async({status,body})=>{
 const response=Response.json(body,{status});expect(await confirmNativeEndReceipt('wrun_owned',response)).toBe(response);
});
