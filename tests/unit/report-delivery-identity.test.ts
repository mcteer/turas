import {describe,it,expect} from 'vitest';
import {reportDeliveryIdentity} from '../../lib/reports/delivery-identity';
import {reportId} from '../../lib/server/reports/schema';
describe('publication recipient delivery identity',()=>{
 it('keeps a stable UUID while separating environments, recipients, publications and provider purpose',()=>{
  const id=reportDeliveryIdentity('env','publication','recipient','delivery');
  expect(reportId.safeParse(id).success).toBe(true);
  expect(reportDeliveryIdentity('env','publication','recipient','delivery')).toBe(id);
  for(const args of [['other','publication','recipient','delivery'],['env','other','recipient','delivery'],['env','publication','other','delivery'],['env','publication','recipient','provider']] as const)
   expect(reportDeliveryIdentity(args[0],args[1],args[2],args[3])).not.toBe(id);
 });
});
