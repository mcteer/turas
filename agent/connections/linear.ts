import { connect } from "@vercel/connect/eve";
import { defineDynamic, defineMcpClientConnection } from "eve/connections";
import { existingGrantOnly } from "../lib/existing-grant-auth";

const connection = defineMcpClientConnection({
  url: "https://mcp.linear.app/mcp",
  description: "Approved delivery issues, projects, and comments stored in Linear. Select from the engagement's known source, never from a customer name matching Linear.",
  auth: existingGrantOnly(connect("mcp.linear.app/linear")),

  // For app-scoped authentication, replace the auth block above with:
  // auth: connect({ connector: "linear", principalType: "app" }),
});
export default defineDynamic({ events: { "session.started": () => process.env.TURAS_ENABLE_CONNECTORS === "true" ? connection : null } });
