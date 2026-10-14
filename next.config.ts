import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@js-temporal/polyfill"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  outputFileTracingIncludes: {
    "/api/staffing/*": ["./node_modules/@js-temporal/polyfill/**/*", "./node_modules/jsbi/**/*"],
  },
  outputFileTracingExcludes: {
    "/*": ["./local-artifacts/**/*", "./.env*", "./.eve/.workflow-data/**/*"],
  },
};

export default withEve(nextConfig);
