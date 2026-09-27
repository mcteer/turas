import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig, type ServerConfig } from "../config";
import type { CurrentSession } from "./sessions";

export function checkMutationOrigin(request: Request, config: ServerConfig = getServerConfig()): void {
  if (request.headers.get("origin") !== config.TURAS_APP_ORIGIN) {
    throw new HttpFailure(403, "invalid_origin", "Request origin denied");
  }
}

export function csrfTokenForSession(token: string, config: ServerConfig = getServerConfig()): string {
  return createHmac("sha256", config.TURAS_MAINTENANCE_SECRET)
    .update("turas-csrf-v1:").update(token).digest("hex");
}

export function checkSessionCsrf(
  request: Request,
  session: CurrentSession,
  config: ServerConfig = getServerConfig(),
): void {
  checkMutationOrigin(request, config);
  const provided = request.headers.get("x-csrf-token") ?? "";
  const expected = csrfTokenForSession(session.token, config);
  if (!/^[0-9a-f]{64}$/.test(provided) ||
      !timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"))) {
    throw new HttpFailure(403, "invalid_csrf", "Request verification failed");
  }
}
