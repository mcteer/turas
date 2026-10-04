import {isAbsolute,resolve} from 'node:path';
import {HttpFailure} from '../../contracts/http';
export function reportConfig(env:NodeJS.ProcessEnv=process.env) {
 const root=env.TURAS_REPORT_STORE_ROOT;
 if(root && (!isAbsolute(root) || root===resolve('/') || root===env.TURAS_ARTIFACT_STORE_ROOT || /[\r\n,]/.test(root)))throw new HttpFailure(503,'store_unavailable','Report store unavailable');
  return {enabled:env.TURAS_REPORTS_ENABLED==='true',deliveryEnabled:env.TURAS_REPORT_DELIVERY_ENABLED==='true',storeRoot:root,rendererImage:env.TURAS_REPORT_RENDERER_IMAGE,
   senderAddress:env.TURAS_REPORT_SENDER_ADDRESS,senderId:env.TURAS_REPORT_SENDER_ID,senderDomainId:env.TURAS_REPORT_SENDER_DOMAIN_ID,
   apiKey:env.RESEND_API_KEY,webhookSecret:env.RESEND_WEBHOOK_SECRET,
   recipientKeys:env.TURAS_REPORT_RECIPIENT_HMAC_KEYS,activeKeyId:env.TURAS_REPORT_RECIPIENT_HMAC_KEY_ID};
}
