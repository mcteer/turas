import { readFileSync } from "node:fs";
import { reconcileFromEvents, type IndexedNativeEvent } from "../../lib/server/conversations/reconcile";
import { closeRuntimePool } from "../../lib/server/db/client";

const input = JSON.parse(readFileSync(0, "utf8")) as {
  nativeSessionId: string; attemptId: string; events: IndexedNativeEvent[];
};
try {
  const result = await reconcileFromEvents(input.nativeSessionId, input.attemptId, input.events);
  process.stdout.write(JSON.stringify(result));
} finally { await closeRuntimePool(); }
