import {it,expect} from 'vitest';
import {executiveArtifactFixtures} from '../fixtures/reports/executive';
import {compareReportDocuments} from '../../lib/server/reports/corrections';
it('identifies exact section, measure and annotation changes without returning protected prose',()=>{
 const previous=executiveArtifactFixtures()[0].document,current=structuredClone(previous);
 current.sections[0].blocks[0].text='CHANGED_PROSE_NOT_RETURNED';
 current.metrics[0].value='7.00';current.annotations=['Reviewer recommendation, not an accepted fact'];
 const comparison=compareReportDocuments(previous,current);
 expect(comparison.changedSections).toEqual([current.sections[0].heading]);
 expect(comparison.changedMeasures).toEqual([current.metrics[0].label]);expect(comparison.annotationsChanged).toBe(true);
 expect(JSON.stringify(comparison)).not.toContain('CHANGED_PROSE_NOT_RETURNED');
 expect(compareReportDocuments(previous,previous)).toEqual({changedSections:[],changedMeasures:[],annotationsChanged:false});
});
