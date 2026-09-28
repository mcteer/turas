import assert from "node:assert/strict";
import test from "node:test";
import { createCanvas } from "@napi-rs/canvas";

test("the pinned native canvas adapter loads in the parser runtime", () => {
  const canvas = createCanvas(1, 1);
  assert.equal(canvas.width, 1);
  assert.equal(canvas.height, 1);
  assert.equal(canvas.toBuffer("image/png").subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
});
