import { connect } from "@vercel/connect/eve";
import { defineDynamic, defineMcpClientConnection } from "eve/connections";
import { existingGrantOnly } from "../lib/existing-grant-auth";

const connection = defineMcpClientConnection({
  url: "https://coda.io/apis/mcp",
  description: "Approved delivery records stored in Coda docs and tables. Select from the engagement's known source, never from a customer name matching Coda.",
  auth: existingGrantOnly(connect("coda/coda")),
});
export default defineDynamic({ events: { "session.started": () => process.env.TURAS_ENABLE_CONNECTORS === "true" ? connection : null } });
