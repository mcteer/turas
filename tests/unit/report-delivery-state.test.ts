import {describe,it,expect} from 'vitest';
import {reportDeliveryMayPost,reportDeliveryRetry,projectReportDeliveryEvidence} from '../../lib/reports/delivery-state';
describe('persistent delivery recovery rules',()=>{
 const first='2026-10-01T00:00:00Z';
 it('permits identical-key recovery before 23 hours and blocks it at the boundary',()=>{
  expect(reportDeliveryMayPost({state:'uncertain',attemptCount:1,firstDispatchAt:first},'2026-10-01T22:59:59.999Z')).toBe(true);
  expect(reportDeliveryMayPost({state:'uncertain',attemptCount:1,firstDispatchAt:first},'2026-10-01T23:00:00Z')).toBe(false);
  expect(reportDeliveryMayPost({state:'uncertain',attemptCount:3,firstDispatchAt:first},'2026-10-01T01:00:00Z')).toBe(false);
 });
 it.each(['provider_accepted','delivered','bounced','complained','blocked','cancelled','expired','permanent_failure','dispatching'])('does not POST after %s',state=>expect(reportDeliveryMayPost({state,attemptCount:1,firstDispatchAt:first},'2026-10-01T01:00:00Z')).toBe(false));
 it('does not treat missing or corrupt dispatch history as a fresh send',()=>{
  expect(reportDeliveryMayPost({state:'uncertain',attemptCount:1,firstDispatchAt:null},first)).toBe(false);
  expect(reportDeliveryMayPost({state:'queued',attemptCount:1,firstDispatchAt:null},first)).toBe(false);
  expect(reportDeliveryMayPost({state:'queued',attemptCount:0,firstDispatchAt:null},first)).toBe(true);
  expect(reportDeliveryMayPost({state:'uncertain',attemptCount:1,firstDispatchAt:'bad'},first)).toBe(false);
 });
 it('bounds retries without extending the original clock',()=>{
  expect(reportDeliveryRetry('retryable_failure',1,0)).toEqual({state:'retryable_failure',delaySeconds:60});
  expect(reportDeliveryRetry('retryable_failure',2,1)).toEqual({state:'retryable_failure',delaySeconds:300});
  expect(reportDeliveryRetry('retryable_failure',2,9000)).toEqual({state:'retryable_failure',delaySeconds:3600});
  expect(reportDeliveryRetry('retryable_failure',3,60)).toEqual({state:'permanent_failure',delaySeconds:null});
  expect(reportDeliveryRetry('uncertain',3,60)).toEqual({state:'uncertain',delaySeconds:null});
 });
 it('projects append-only receipt facts independently of arrival order and duplication',()=>{
  expect(projectReportDeliveryEvidence(['delivered','accepted','accepted'])).toBe('delivered');
  expect(projectReportDeliveryEvidence(['accepted','delivered','bounced'])).toBe('bounced');
  expect(projectReportDeliveryEvidence(['complained','delivered','accepted'])).toBe('complained');
  expect(projectReportDeliveryEvidence(['failed','delivered'])).toBe('delivered');
  expect(projectReportDeliveryEvidence(['accepted'])).toBe('provider_accepted');
 });
});
