import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@js-temporal/polyfill"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  outputFileTracingIncludes: {
    // Reports hash these authored runtime files; bundled modules do not replace their raw bytes.
    "/*": [
      "./report-templates/assets/vercel-logotype.svg",
      "./report-templates/assets/vercel-logotype.png",
      "./report-templates/fonts/Geist-Regular.ttf",
      "./report-templates/fonts/Geist-Bold.ttf",
      "./report-templates/fonts/LICENSE.txt",
      "./report-templates/fonts/manifest.json",
      "./report-templates/assets/PROVENANCE.md",
      "./report-templates/weekly.ts",
      "./report-templates/executive.ts",
      "./report-templates/brand-manifest.json",
      "./report-renderer/layout.ts",
      "./report-renderer/render.ts",
      "./report-renderer/validate.py",
    ],
    "/api/staffing/*": ["./node_modules/@js-temporal/polyfill/**/*", "./node_modules/jsbi/**/*"],
  },
  outputFileTracingExcludes: {
    "/*": ["./local-artifacts/**/*", "./.env*", "./.eve/.workflow-data/**/*"],
  },
};

export default withEve(nextConfig);
