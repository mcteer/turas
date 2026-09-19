import type { EveConnectAuthorizationDefinition } from "@vercel/connect/eve";
import {
  ConnectionAuthorizationFailedError,
  type ConnectionAuthProvider,
  type InteractiveAuthorizationDefinition,
  isConnectionAuthorizationRequiredError,
} from "eve/connections";

/** Engagement chat can use existing grants, but never starts connector onboarding. */
export function existingGrantOnly(
  provider: EveConnectAuthorizationDefinition<InteractiveAuthorizationDefinition>,
) {
  return {
    credentialOwner: "user",
    vercelConnect: provider.vercelConnect,
    evict: provider.evict,
    async getToken(context) {
      try {
        return await provider.getToken(context);
      } catch (error) {
        if (isConnectionAuthorizationRequiredError(error)) {
          throw new ConnectionAuthorizationFailedError(error.connectionName, {
            message: "The requested engagement records are unavailable. Continue with verified context or ask for the latest engagement note.",
            reason: "engagement_records_unavailable",
            retryable: false,
          });
        }
        throw error;
      }
    },
  } satisfies ConnectionAuthProvider & Pick<typeof provider, "vercelConnect" | "evict">;
}
