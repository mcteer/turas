import {beforeEach,afterEach,vi} from 'vitest';
beforeEach(()=>vi.stubEnv('TURAS_MAINTENANCE_SECRET','synthetic-receipt-contract-secret'));
afterEach(()=>vi.unstubAllEnvs());
import {test} from 'vitest';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {context} from '../fixtures/legacy-solution-research';
import type {AppIdentity} from '../../lib/server/research/specialists/identity';
const identity={userId:'synthetic',workspaceId:'synthetic',environmentId:'test'} as AppIdentity;
import {releaseChronology,missingChronologyEntries} from '../../lib/server/research/specialists/solution-research/release-chronology';
import {bindCustomerUpdate,customerUpdateRevisionReasons,customerUpdateSubmissionSchema} from '../../lib/server/research/specialists/solution-research/customer-update';
import {signCustomerUpdate,verifyCustomerUpdate} from '../../lib/server/research/specialists/solution-research/customer-update-receipt';
import {sourceSchema} from '../../lib/server/research/specialists/solution-research/schema';
const source={id:'release-index',url:'https://example.org/releases',title:'Product releases',retrievedAt:'2026-09-21T12:00:00Z',focusTerm:'Queue',excerpt:
 'September 15, 20263.7\n# Team skills\n'+('Unrelated release information. '.repeat(22))+'\nQueue management and run logs are in the Developer sidebar.\n\nAugust 19, 2026\n# Developer portal\n'+('Sidebar documentation. '.repeat(25))+'\nManage Queue jobs and inspect each run from the Developer sidebar.\n\nJuly 24, 2026\n# Usage\n'+('Usage documentation. '.repeat(25))+'\nQueue usage appears in the credits dashboard.'};
const chronology=releaseChronology(source)!;
const finding=(entry:typeof chronology.entries[number])=>({claim:`The release documents Queue functionality by ${entry.documentedBy}.`,scope:'Dated documentation, first availability unknown',sourceId:source.id,passageId:entry.passages.at(-1)!.id,supportingPassageIds:[entry.datePassageId],publisherType:'customer',sourceType:'customer_publication'});
function submission(entries:typeof chronology.entries){const na={status:'not_applicable',sourceIds:[],note:'Focused fixture for release chronology only.'};return customerUpdateSubmissionSchema.parse({accountId:context.accountId,question:'What changes are documented for Queue?',findings:entries.map(finding),conflicts:[],unknowns:[],coverage:{release_history:{status:'checked',sourceIds:[source.id],currentIndexSourceId:source.id,note:'Reviewed dated entries in the main release index.'},current_documentation:na,availability_and_pricing:na,operations_and_limits:na,employee_testimony:{...na,searchIds:[]},practitioner_experience:{...na,searchIds:[]}}});}

test('chronology preserves earlier dated evidence without declaring first availability',()=>{
 assert.deepEqual(chronology.entries.map(e=>e.documentedBy),['2026-09-15','2026-08-19','2026-07-24']);
 assert.equal(chronology.dateMeaning,'documented_by');assert.equal(chronology.firstAvailability,'not_established');
 for(const entry of chronology.entries){assert.ok(source.excerpt.includes(entry.dateQuote));for(const p of entry.passages)assert.ok(source.excerpt.includes(p.quote));}
 assert.equal(('publication' in source),false,'Section dates never create publication metadata');
 assert.equal(releaseChronology({...source,focusTerm:undefined}),undefined);
 assert.equal(releaseChronology({...source,focusTerm:'Absent'}),undefined);
});

test('a recap-only summary cannot discard earlier evidence or claim checked chronology',()=>{
 const input=submission([chronology.entries[0],chronology.entries[2]]);
 const bound=bindCustomerUpdate(input,[source]);
 assert.equal(bound.update.coverage!.release_history.status,'unavailable');
 assert.ok(bound.blockers.some(b=>b.includes('2026-08-19')));
 assert.ok(customerUpdateRevisionReasons(input,bound).some(r=>r.includes('2026-08-19')&&r.includes(chronology.entries[1].datePassageId)));
 assert.deepEqual(bound.update.releaseChronology,chronology);
 for(const entry of chronology.entries){assert.ok(bound.sources[0].excerpt.includes(entry.dateQuote));for(const p of entry.passages)assert.ok(bound.sources[0].excerpt.includes(p.quote),'Earlier passages survive into solution research');}
 assert.ok(sourceSchema.safeParse(bound.sources[0]).success);
 const corrected=submission(chronology.entries);const repaired=bindCustomerUpdate(corrected,[source]);
 assert.equal(repaired.update.coverage!.release_history.status,'checked');
 assert.deepEqual(customerUpdateRevisionReasons(corrected,repaired),[]);
 assert.deepEqual(missingChronologyEntries(chronology,repaired.update.findings),[]);
});

test('a date passage from a different release cannot complete an earlier finding',()=>{
 const earlier=finding(chronology.entries[1]);earlier.supportingPassageIds=[chronology.entries[0].datePassageId];
 assert.ok(missingChronologyEntries(chronology,[earlier]).some(e=>e.documentedBy==='2026-08-19'));
});

test('chronology is server authored, signed, bounded, and excludes invalid/future section dates',()=>{
 assert.equal(customerUpdateSubmissionSchema.safeParse({...submission(chronology.entries),releaseChronology:chronology}).success,false);
 vi.stubEnv('TURAS_MAINTENANCE_SECRET',randomBytes(32).toString('hex'));
 const now=new Date();const receipt=signCustomerUpdate({userId:identity.userId,workspaceId:identity.workspaceId,environmentId:identity.environmentId,issuedAt:now.toISOString(),context,...bindCustomerUpdate(submission(chronology.entries),[source])});
 assert.equal(verifyCustomerUpdate(receipt,identity,now.getTime()),true);
 const changed=structuredClone(receipt);changed.payload.update.releaseChronology!.entries[1].documentedBy='2026-09-15';
 assert.equal(verifyCustomerUpdate(changed,identity,now.getTime()),false);
 const many={...source,excerpt:['September 20, 2026','September 19, 2026','September 18, 2026','September 17, 2026','September 16, 2026','February 30, 2026','October 1, 2026'].map(d=>d+'\nQueue documented.\n'+('Padding text. '.repeat(40))).join('\n')};
 const bounded=releaseChronology(many)!;assert.equal(bounded.entries.length,4);assert.equal(bounded.omittedDateCount,1);assert.equal(bounded.entries[0].documentedBy,'2026-09-20');
 const legacy={...source,focusTerm:undefined};
 assert.equal(bindCustomerUpdate(submission([chronology.entries[0]]),[legacy]).update.releaseChronology,undefined,'Legacy receipts keep their previous shape');
});
