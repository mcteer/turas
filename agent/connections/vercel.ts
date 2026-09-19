import { connect } from "@vercel/connect/eve";
import { defineDynamic, defineMcpClientConnection } from "eve/connections";
import { existingGrantOnly } from "../lib/existing-grant-auth";

const connection = defineMcpClientConnection({
  url: "https://mcp.vercel.com",
  description: "Vercel: manage projects and deployments, inspect logs, and search documentation.",
  auth: existingGrantOnly(connect("vercel/vercel")),
});
export default defineDynamic({ events: { "session.started": () => process.env.TURAS_ENABLE_CONNECTORS === "true" ? connection : null } });
