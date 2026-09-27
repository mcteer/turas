import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

// Check authored documentation, not upstream templates with intentional placeholders.
const root = process.cwd();
const files = [
  "README.md", "AGENTS.md", "CONTRIBUTING.md", "ROADMAP.md",
  ".specify/memory/constitution.md", ".github/pull_request_template.md",
];
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.name.endsWith(".md")) files.push(path);
  }
}
for (const directory of ["docs", "specs"]) collect(directory);

const failures = [];
for (const file of files) {
  const content = readFileSync(file, "utf8");
  if (!content.endsWith("\n")) failures.push(`${file}: missing final newline`);
  const prose = content.replace(/```[^\n]*\n[\s\S]*?```/g, "");
  for (const match of prose.matchAll(/!?\[[^\]\n]*\]\(([^)\s]+)\)/g)) {
    const href = match[1].replace(/^<|>$/g, "");
    if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(href)) continue;
    const path = decodeURIComponent(href.split(/[?#]/)[0]);
    if (!path) continue;
    const target = resolve(dirname(file), path);
    if (relative(root, target).startsWith("..") || !existsSync(target)) {
      failures.push(`${file}: missing or external local link ${href}`);
    }
  }
}

// Filename hygiene only; this is not a replacement for a content secret scanner.
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0");
for (const file of tracked.filter(Boolean)) {
  if (/(^|\/)\.env(?:\.|$)/.test(file) && file !== ".env.example") {
    failures.push(`Private environment file tracked: ${file}`);
  }
  if (/^(?:node_modules|\.eve|\.vercel|\.output|local-artifacts|tmp)\//.test(file)) {
    failures.push(`Local/generated path tracked: ${file}`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Checked ${files.length} authored Markdown files and tracked-file hygiene.`);
}
