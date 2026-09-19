import { connect } from "@vercel/connect/eve";
import { defineDynamic, defineMcpClientConnection } from "eve/connections";
import { existingGrantOnly } from "../lib/existing-grant-auth";

const connection = defineMcpClientConnection({
  url: "https://mcp.notion.com/mcp",
  description: "Approved delivery records stored in Notion pages and databases. This is a storage provider, not the Notion customer account. Use only when the engagement's known source is a Notion workspace; never select it just because the customer is named Notion.",
  auth: existingGrantOnly(connect("mcp.notion.com/notion")),

  // For app-scoped authentication, replace the auth block above with:
  // auth: connect({ connector: "notion", principalType: "app" }),

  // For JWT bearer authentication, replace the auth block above with:
  // auth: connect({
  //   connector: "notion",
  //   principalToSubject: (principal) => {
  //     const email = principal.type === "user" ? principal.attributes?.email : undefined;
  //     if (typeof email !== "string") {
  //       throw new Error("JWT bearer authentication requires a user principal with an email.");
  //     }
  //     return { type: "jwt-bearer", sub: email };
  //   },
  // }),

  // Notion also supports OpenAPI. See https://eve.dev/integrations/notion for that scaffold.
});
export default defineDynamic({ events: { "session.started": () => process.env.TURAS_ENABLE_CONNECTORS === "true" ? connection : null } });
