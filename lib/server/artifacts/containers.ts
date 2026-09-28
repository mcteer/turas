import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";

export type ArtifactContainerKind = "scan" | "parse";

export type ArtifactContainerInvocation = {
  name: string;
  args: string[];
  deadlineMs: number;
  maxOutputBytes: number;
};

const INPUT_TARGET = "/input";

function trustedMount(path: string, target: string): string {
  if (!isAbsolute(path) || /[\x00-\x1f,]/.test(path)) throw new Error("Invalid trusted artifact mount path");
  return `type=bind,src=${path},dst=${target},readonly`;
}

/** Fixed, fail-closed Docker arguments. Only the host artifact worker invokes these. */
export function artifactContainerInvocation(input: {
  kind: ArtifactContainerKind;
  image: string;
  originalPath: string;
  signaturesPath?: string;
  ocrAssetsPath?: string;
}): ArtifactContainerInvocation {
  if (!/^turas-artifact-(scanner|parser):004-v1$/.test(input.image)) throw new Error("Unpinned artifact image");
  if ((input.kind === "scan") !== input.image.includes("scanner")) throw new Error("Artifact image/kind mismatch");
  const scan = input.kind === "scan";
  const name = `turas-artifact-${randomUUID()}`;
  const args = [
    "run", "--rm", "--name", name,
    "--network", "none", "--ipc", "none", "--read-only",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
    "--user", scan ? "100:101" : "65532:65532",
    "--memory", scan ? "4g" : "1g", "--memory-swap", scan ? "4g" : "1g",
    "--cpus", "2", "--pids-limit", "64", "--ulimit", "nofile=64:64",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=128m",
    "--mount", trustedMount(input.originalPath, INPUT_TARGET),
  ];
  if (scan) {
    if (!input.signaturesPath || input.ocrAssetsPath) throw new Error("Scanner requires signatures only");
    args.push("--mount", trustedMount(input.signaturesPath, "/signatures"));
  } else {
    if (!input.ocrAssetsPath || input.signaturesPath) throw new Error("Parser requires OCR assets only");
    args.push("--mount", trustedMount(input.ocrAssetsPath, "/assets"));
    args.push("--tmpfs", "/output:rw,noexec,nosuid,size=50m");
  }
  args.push(input.image);
  return { name, args, deadlineMs: scan ? 30_000 : 90_000, maxOutputBytes: scan ? 65_536 : 52_428_800 };
}
