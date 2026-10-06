import { defineChannel, POST, GET } from "eve/channels";
import { failure, success } from "../../lib/contracts/http";
import { performMaintenance } from "../../lib/server/conversations/maintenance";
import { verifyMaintenanceRequest } from "../../lib/server/conversations/watchdog";
import { authorizeHostedWatchdog, runHostedWatchdog } from "../../lib/server/conversations/hosted-watchdog";

export default defineChannel({
  routes: [
    GET("/eve/v1/turas/watchdog", async (request, { attachSession }) => {
      try {
        authorizeHostedWatchdog(request);
        await runHostedWatchdog(attachSession);
        return success({ status: "completed" });
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
