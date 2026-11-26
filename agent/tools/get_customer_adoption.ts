import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { hiddenRecord } from '../../lib/contracts/http';
import { adoptionReceiptScope } from '../../lib/server/conversations/adoption-context';
import { withTransaction } from '../../lib/server/db/client';
import { readCustomerAccountEvidence } from '../../lib/server/conversations/customer-accounts';
import { normalChatTool } from '../lib/normal-chat-tool';

export const authoredTool = defineTool({
  description: 'Read a scoped customer adoption summary using the canonical account ID from resolve_customer_account. Returns dated product-use records and curated public product or platform signals with workload and source references, not raw passages. Use for ordinary adoption summaries. Partial or empty coverage is not evidence of non-use. For exact quotes, source comparison or other factual context use the governed evidence tools.',
  inputSchema: z.object({ accountId: z.uuid(), page: z.number().int().min(1).max(10).default(1) }).strict(),
  execute: async ({ accountId, page }, ctx) => {
    const principal = ctx.session.auth.current;
    const attemptId = principal?.attributes?.turasAttemptId;
    if (typeof attemptId !== 'string') throw hiddenRecord();
    const result = await withTransaction(db => readCustomerAccountEvidence(db, principal, accountId, { page, adoptionOnly: true }));
    return { ...result, receiptScope: adoptionReceiptScope(attemptId) };
  },
});
export default normalChatTool(authoredTool);
