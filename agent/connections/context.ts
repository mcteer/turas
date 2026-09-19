import { connect } from "@vercel/connect/eve";
import { defineDynamic, defineMcpClientConnection } from "eve/connections";
import { existingGrantOnly } from "../lib/existing-grant-auth";

const connection = defineMcpClientConnection({
  url: "https://mcp.context.dev/mcp",
  description:
    "context.dev: search the live web, scrape and crawl sites, extract structured data, parse files, retrieve brand intelligence, monitor changes, and run batch jobs.",
  auth: existingGrantOnly(connect("mcp.context.dev/context")),
});
export default defineDynamic({ events: { "session.started": () => process.env.TURAS_ENABLE_CONNECTORS === "true" ? connection : null } });
