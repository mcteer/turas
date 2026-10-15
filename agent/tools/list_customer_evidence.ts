import {defineTool} from 'eve/tools';
import {z} from 'zod';
import {withTransaction} from '../../lib/server/db/client';
import {publicInventorySearchSchema,listPublicCustomerInventory} from '../../lib/server/profiles/public-inventory';
import {customerAccountTool} from '../lib/customer-account-tool';

export const authoredTool=defineTool({
 description:'Search the bounded authorized customer inventory by name, alias, documented workload or product, optionally filtering the original five qualitative public delivery signals. Paginated summaries only: use get_customer_evidence for exact citations, dates and scope before making claims. No formal maturity grade or complete CRM coverage is implied. Null inventory fields mean unknown; absence is not proof that an organization is not a Vercel customer.',
 inputSchema:publicInventorySearchSchema,
 outputSchema:z.object({dataVersion:z.string(),reviewedAt:z.string().nullable(),coverage:z.string(),limitations:z.string(),total:z.number(),nextOffset:z.number().nullable(),accounts:z.array(z.object({id:z.uuid(),name:z.string(),storyCount:z.number().nullable(),directoryListed:z.boolean().nullable(),formalMaturity:z.literal('unknown')}))}),
 execute:(input,ctx)=>withTransaction(db=>listPublicCustomerInventory(db,ctx.session.auth.current,input)),
});
export default customerAccountTool(authoredTool);
