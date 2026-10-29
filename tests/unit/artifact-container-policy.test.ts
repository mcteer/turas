import { describe, expect, it } from "vitest";
import { artifactContainerInvocation } from "../../lib/server/artifacts/containers";

describe("artifact container invocation", () => {
  it("requires the exact selected immutable image for its kind",()=>{
    const oldParser=process.env.TURAS_PILOT_PARSER_IMAGE,oldScanner=process.env.TURAS_PILOT_SCANNER_IMAGE;
    try{
      process.env.TURAS_PILOT_PARSER_IMAGE="sha256:"+"a".repeat(64);process.env.TURAS_PILOT_SCANNER_IMAGE="sha256:"+"b".repeat(64);
      const input={kind:"scan" as const,originalPath:"/private/input",signaturesPath:"/private/signatures"};
      expect(artifactContainerInvocation({...input,image:process.env.TURAS_PILOT_SCANNER_IMAGE}).args).toContain(process.env.TURAS_PILOT_SCANNER_IMAGE);
      expect(()=>artifactContainerInvocation({...input,image:process.env.TURAS_PILOT_PARSER_IMAGE!})).toThrow("Unapproved immutable");
      expect(()=>artifactContainerInvocation({...input,image:"sha256:"+"c".repeat(64)})).toThrow("Unapproved immutable");
    }finally{if(oldParser===undefined)delete process.env.TURAS_PILOT_PARSER_IMAGE;else process.env.TURAS_PILOT_PARSER_IMAGE=oldParser;if(oldScanner===undefined)delete process.env.TURAS_PILOT_SCANNER_IMAGE;else process.env.TURAS_PILOT_SCANNER_IMAGE=oldScanner;}
  });
  it("pins scan limits and mounts only the original and signatures", () => {
    const run = artifactContainerInvocation({ kind: "scan", image: "turas-artifact-scanner:004-v1", originalPath: "/private/source", signaturesPath: "/private/signatures" });
    const command = run.args.join(" ");
    expect(command).toContain("--network none");
    expect(command).toContain("--read-only");
    expect(command).toContain("--cap-drop ALL");
    expect(command).toContain("--memory 4g");
    expect(command).toContain("src=/private/source,dst=/input,readonly");
    expect(command).toContain("src=/private/signatures,dst=/signatures,readonly");
    expect(command).not.toContain("/output");
    expect(run.deadlineMs).toBe(30_000);
  });

  it("pins parser limits with offline OCR assets and no signatures", () => {
    const run = artifactContainerInvocation({ kind: "parse", image: "turas-artifact-parser:004-v1", originalPath: "/private/source", ocrAssetsPath: "/private/assets" });
    const command = run.args.join(" ");
    expect(command).toContain("--memory 1g");
    expect(command).toContain("--tmpfs /output:rw,noexec,nosuid,size=50m");
    expect(command).toContain("src=/private/assets,dst=/assets,readonly");
    expect(command).not.toContain("/signatures");
    expect(run.deadlineMs).toBe(90_000);
    expect(run.maxOutputBytes).toBe(52_428_800);
  });

  it("rejects swapped images and mount-option injection", () => {
    expect(() => artifactContainerInvocation({ kind: "scan", image: "node:latest", originalPath: "/input", signaturesPath: "/signatures" })).toThrow("Unpinned");
    expect(() => artifactContainerInvocation({ kind: "scan", image: "turas-artifact-parser:004-v1", originalPath: "/input", signaturesPath: "/signatures" })).toThrow("mismatch");
    expect(() => artifactContainerInvocation({ kind: "scan", image: "turas-artifact-scanner:004-v1", originalPath: "/input,ro=false", signaturesPath: "/signatures" })).toThrow("mount path");
  });
});
