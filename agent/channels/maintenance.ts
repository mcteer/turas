import { defineChannel, POST, GET } from "eve/channels";
import { failure, success } from "../../lib/contracts/http";
import { performMaintenance } from "../../lib/server/conversations/maintenance";
import { verifyMaintenanceRequest } from "../../lib/server/conversations/watchdog";
import { authorizeHostedWatchdog, runHostedWatchdog } from "../../lib/server/conversations/hosted-watchdog";

export default defineChannel({
  routes: [
    GET("/eve/v1/turas/watchdog", async (request, { attachSession,waitUntil }) => {
      try {
        authorizeHostedWatchdog(request);
        waitUntil(runHostedWatchdog(attachSession).catch(()=>{console.error(JSON.stringify({kind:'turas_hosted_watchdog_failed'}));}));
        return success({ status: "accepted" });
      } catch (error) { return failure(error); }
    }),
    POST("/internal/turas/maintenance", async (request, { attachSession }) => {
      try {
        const payload = await verifyMaintenanceRequest(request);
        const status = await performMaintenance(payload, attachSession);
        return success({ status });
      } catch (error) {
        return failure(error);
      }
    }),
  ],
});
