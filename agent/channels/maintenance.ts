import { defineChannel, POST } from "eve/channels";
import { failure, success } from "../../lib/contracts/http";
import { performMaintenance } from "../../lib/server/conversations/maintenance";
import { verifyMaintenanceRequest } from "../../lib/server/conversations/watchdog";

export default defineChannel({
  routes: [
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
