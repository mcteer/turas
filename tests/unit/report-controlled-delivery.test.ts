import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {parseControlledReportDeliveryArgs} from '../../scripts/check-report-delivery';
it('requires explicit live synthetic-test authorization and exact immutable identities',()=>{
 const id=randomUUID(),args=['--live','--synthetic-test',`--delivery-id=${id}`,`--payload-digest=${'a'.repeat(64)}`,`--recipient-digest=${'b'.repeat(64)}`];
 expect(parseControlledReportDeliveryArgs(args)).toEqual({deliveryId:id,payloadDigest:'a'.repeat(64),recipientDigest:'b'.repeat(64)});
 expect(()=>parseControlledReportDeliveryArgs(args.slice(1))).toThrow();
 expect(()=>parseControlledReportDeliveryArgs([...args,'--retry'])).toThrow();
 expect(()=>parseControlledReportDeliveryArgs([...args.slice(0,4),args[2]])).toThrow();
 expect(()=>parseControlledReportDeliveryArgs([...args.slice(0,4),'--recipient-digest=invalid'])).toThrow();
});
