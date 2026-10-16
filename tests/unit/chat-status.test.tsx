import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatStatus } from "../../app/_components/chat-status";

describe("chat response notices", () => {
  it("does not describe a cancellation or failed turn as completed", () => {
    for (const state of ["cancelled", "failed"]) {
      const html = renderToStaticMarkup(<ChatStatus responseState={state} />);
      expect(html).toContain("Partial output may be visible");
      expect(html).not.toContain("Response complete");
    }
  });

  it("separates a requested stop from native confirmation", () => {
    const stopping = renderToStaticMarkup(<ChatStatus responseState="stopping" />);
    expect(stopping).toContain("Waiting for confirmation");
    const cancelled = renderToStaticMarkup(<ChatStatus responseState="cancelled" />);
    expect(cancelled).not.toContain("Waiting for confirmation");
  });
});

it('keeps failed input and operator notices visible after an earlier completed turn',()=>{
 const html=renderToStaticMarkup(<ChatStatus quietSuccess responseState="completed" notice="Your response could not be confirmed." error/>);
 expect(html).toContain('Your response could not be confirmed.');
 expect(renderToStaticMarkup(<ChatStatus quietSuccess responseState="completed"/>)).toBe('');
});
