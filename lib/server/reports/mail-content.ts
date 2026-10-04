import type {ReportDocument} from '../../reports/document';
import {validateReportDocument} from '../../reports/document';
import {renderWeeklyTemplate,renderReportPlainText} from '../../../report-templates/weekly';
import {HttpFailure} from '../../contracts/http';
import {reportDigest} from './commands';
export function prepareReportMail(raw:ReportDocument){
 const document=validateReportDocument(raw),html=renderWeeklyTemplate(document),plainText=renderReportPlainText(document);
 if(Buffer.byteLength(html)>262144 || Buffer.byteLength(plainText)>262144)throw new HttpFailure(422,'scope_too_large','Narrow the report email content');
 return {html,plainText,contentDigest:reportDigest({html,plainText})};
}
