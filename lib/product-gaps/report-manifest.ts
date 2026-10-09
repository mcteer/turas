import type {GapReportDocument} from './report-document';
import {gapReportMarkdown} from './report-markdown';
/** Both formats derive from the same disclosed recipient document. */
export function gapReportManifest(document:GapReportDocument){return structuredClone(document);}
export function gapReportBytes(document:GapReportDocument){const json=Buffer.from(JSON.stringify(gapReportManifest(document),null,2).replace(/</g,'\\u003c').replace(/>/g,'\\u003e'),'utf8'),markdown=Buffer.from(gapReportMarkdown(document),'utf8');if(json.length>5*1024*1024||markdown.length>5*1024*1024)throw Error('Report export exceeds limit');return {json,markdown};}
