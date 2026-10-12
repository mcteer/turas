import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {verifyWorkBackupPricing,workBackupPricingDigest,workBackupCostCeilings} from '../../../lib/server/operations/work-backup-pricing';
const input=()=>({maximumObjectBytes:25165824,pricingDigest:workBackupPricingDigest(),hostingCeilingMicroUsd:100000,blobCeilingMicroUsd:50000});
const html=[
 '<html>Washington D.C., USA (iad1) $0.128 $0.0106 $0.60 per million</html>',
 '<html>Blob Storage Size $0.023 per GB Blob Simple Operations $0.400 per 1M Blob Advanced Operations $5.000 per 1M Blob Data Transfer $0.050 per GB</html>',
 '<html>Fast Data Transfer $0.15 per 1 GB CDN Requests $2.00 per 1,000,000 Requests Fast Origin Transfer $0.06 per 1 GB</html>',
];
function transport(pages=html){let calls=0;return {count:()=>calls,fetch:(async()=>new Response(pages[calls++],{headers:{'content-type':'text/html'}})) as typeof fetch};}
it('reserves on-demand CPU memory operations transfer and storage without subtracting free credits',()=>{
 const bounds=workBackupCostCeilings(25165824);expect(bounds.hostingMinimumMicroUsd).toBeGreaterThan(65000);expect(bounds.hostingMinimumMicroUsd).toBeLessThan(100000);expect(bounds.blobMinimumMicroUsd).toBeGreaterThan(44000);expect(bounds.blobMinimumMicroUsd).toBeLessThan(50000);expect(bounds.maximumBlobDownloadBytes).toBe(136314880);
 expect(()=>workBackupCostCeilings(25165825)).toThrow();expect(()=>workBackupCostCeilings(-1)).toThrow();
});
it('binds all three independently downloaded official rate documents by exact bytes',async()=>{
 const fixture=transport(),result=await verifyWorkBackupPricing(input(),AbortSignal.timeout(5000),fixture.fetch);
 expect(fixture.count()).toBe(3);expect(result.actualInvoiceVerified).toBe(false);expect(result.captures.map(row=>row.digest)).toEqual(html.map(bytes=>createHash('sha256').update(bytes).digest('hex')));expect(result.captures.every(row=>row.url.startsWith('https://vercel.com/docs/'))).toBe(true);
});
it('stops on a changed published rate without a retry or later document request',async()=>{
 const fixture=transport([html[0].replace('$0.128','$0.129'),...html.slice(1)]);
 await expect(verifyWorkBackupPricing(input(),AbortSignal.timeout(5000),fixture.fetch)).rejects.toThrow('rate changed');expect(fixture.count()).toBe(1);
});
it('refuses missing pricing and script-only rate claims',async()=>{
 const fixture=transport(['<html><script>'+html[0]+'</script></html>']);
 await expect(verifyWorkBackupPricing(input(),AbortSignal.timeout(5000),fixture.fetch)).rejects.toThrow('rate changed');expect(fixture.count()).toBe(1);
});
it('refuses under-reserved or foreign pricing before any HTTP request',async()=>{
 const fixture=transport(),bounds=workBackupCostCeilings(input().maximumObjectBytes);
 for(const change of [{pricingDigest:'a'.repeat(64)},{hostingCeilingMicroUsd:bounds.hostingMinimumMicroUsd-1},{blobCeilingMicroUsd:bounds.blobMinimumMicroUsd-1}])await expect(verifyWorkBackupPricing({...input(),...change},AbortSignal.timeout(5000),fixture.fetch)).rejects.toThrow('ceiling unavailable');expect(fixture.count()).toBe(0);
});
it('bounds official response bytes before parsing and fails without retry',async()=>{
 const fixture=transport(['x'.repeat(2097153)]);await expect(verifyWorkBackupPricing(input(),AbortSignal.timeout(5000),fixture.fetch)).rejects.toThrow('response exceeds');expect(fixture.count()).toBe(1);
});
it('does not request pricing after cancellation',async()=>{
 const fixture=transport();await expect(verifyWorkBackupPricing(input(),AbortSignal.abort(),fixture.fetch)).rejects.toThrow();expect(fixture.count()).toBe(0);
});
