import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  outputFileTracingExcludes: {
    "/*": ["./local-artifacts/**/*", "./.env*", "./.eve/.workflow-data/**/*"],
  },
};

export default withEve(nextConfig);
