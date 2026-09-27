import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Turi foundation capability inventory", () => {
  it("describes only live chat and refuses to promote claims to profile facts", () => {
    const instructions = readFileSync("agent/instructions.md", "utf8");
    expect(instructions).toMatch(/private customer-scoped chat/i);
    expect(instructions).toMatch(/not accepted profile facts/i);
    expect(instructions).toMatch(/cannot write or update\s+customer profiles/i);
    expect(instructions).toMatch(/attachments.*not available/i);
    expect(instructions).not.toMatch(/can generate approved delivery plans/i);
  });

  it("disables unused host, file, web and subagent tools", () => {
    for (const name of ["bash", "read_file", "write_file", "web_fetch", "web_search", "agent", "task_cancel"]) {
      expect(readFileSync(`agent/tools/${name}.ts`, "utf8")).toContain("disableTool()");
    }
  });
});
