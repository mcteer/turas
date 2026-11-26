import { z } from 'zod';
import { customerAdoptionVersion } from '../profiles/adoption';

const promptMessage = z.object({ role: z.string(), content: z.unknown() });
const adoptionResult = z.object({ type: z.literal('tool-result'), toolName: z.literal('get_customer_adoption'),
  output: z.object({ type: z.literal('json'), value: z.object({
    contractVersion: z.literal(customerAdoptionVersion), customer: z.object({ id: z.uuid() }),
  }) }),
});

/** This only narrows injected context. Authorization and receipt fences still
 * run in the ordinary model wrapper. Pasted JSON never selects an account. */
export function adoptionAccountsInTurn(messages: readonly unknown[]) {
  const ids = new Set<string>();
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = promptMessage.safeParse(messages[i]);
    if (!message.success) continue;
    if (message.data.role === 'user') break;
    if (message.data.role !== 'tool' || !Array.isArray(message.data.content)) continue;
    for (const part of message.data.content) {
      const result = adoptionResult.safeParse(part);
      if (result.success) ids.add(result.data.output.value.customer.id);
    }
  }
  return ids;
}
