import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { PoolClient } from 'pg';
import { HttpFailure } from '../../contracts/http';
import { readCustomerAccountEvidence } from './customer-accounts';
import { z } from 'zod';
import { customerAdoptionVersion } from '../profiles/adoption';

const promptMessage = z.object({ role: z.string(), content: z.unknown() });
const adoptionResult = z.object({ type: z.literal('tool-result'), toolName: z.literal('get_customer_adoption'),
  output: z.object({ type: z.literal('json'), value: z.object({
    contractVersion: z.literal(customerAdoptionVersion), customer: z.object({ id: z.uuid() }),
    page: z.number().int().min(1).max(10), entries: z.array(z.unknown()).max(20),
    receiptScope: z.string().regex(/^[a-f0-9]{64}$/),
  }) }),
});

export function adoptionReceiptScope(attemptId: string) {
  return createHash('sha256').update(`customer-adoption:${attemptId}`).digest('hex');
}

/** Bind receipt replay to the server-owned attempt, not transcript role order:
 * Eve can add user-role framework notes during retries. Pasted JSON is not a tool result. */
export function adoptionReceiptsForAttempt(messages: readonly unknown[], attemptId: string) {
  const scope = adoptionReceiptScope(attemptId);
  const receipts: Array<z.infer<typeof adoptionResult>['output']['value']> = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = promptMessage.safeParse(messages[i]);
    if (!message.success) continue;
    if (message.data.role !== 'tool' || !Array.isArray(message.data.content)) continue;
    for (const part of message.data.content) {
      const result = adoptionResult.safeParse(part);
      if (result.success && result.data.output.value.receiptScope === scope) receipts.push(result.data.output.value);
    }
  }
  return receipts;
}

export async function recheckAdoptionReceipts(db: PoolClient,
  principal: Parameters<typeof readCustomerAccountEvidence>[1],
  receipts: ReturnType<typeof adoptionReceiptsForAttempt>) {
  const pages = new Map<string, unknown>();
  for (const { customer, page, entries } of receipts) {
    const key = `${customer.id}:${page}`;
    if (!pages.has(key)) {
      const current = await readCustomerAccountEvidence(db, principal, customer.id, { adoptionOnly: true, page });
      pages.set(key, current.entries);
    }
    if (!isDeepStrictEqual(pages.get(key), entries)) {
      throw new HttpFailure(409, 'context_changed', 'Adoption evidence changed; ask again for current evidence');
    }
  }
}
