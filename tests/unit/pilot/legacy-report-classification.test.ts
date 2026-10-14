import {it,expect} from 'vitest';
import {legacyReportClassification} from '../../../lib/server/storage/legacy-report-classification';
const key='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
it('classifies exact report and gap identities from both ledgers',()=>{expect([...legacyReportClassification([{object_key:key,namespace:'report'},{object_key:other,namespace:'gap-report'}])]).toEqual([[key,'report'],[other,'gap-report']]);});
it('refuses cross-ledger collisions even for an identical object key',()=>{expect(()=>legacyReportClassification([{object_key:key,namespace:'report'},{object_key:key,namespace:'gap-report'}])).toThrow('identity collision');});
it('refuses repeated ledger identities and unknown classification fields',()=>{expect(()=>legacyReportClassification([{object_key:key,namespace:'report'},{object_key:key,namespace:'report'}])).toThrow('identity collision');expect(()=>legacyReportClassification([{object_key:key,namespace:'report',approved:true}])).toThrow();});
it('requires opaque UUID keys and explicit namespaces',()=>{expect(()=>legacyReportClassification([{object_key:'private-filename.pdf',namespace:'report'}])).toThrow();expect(()=>legacyReportClassification([{object_key:key,namespace:'artifact'}])).toThrow();expect(legacyReportClassification([]).size).toBe(0);});
