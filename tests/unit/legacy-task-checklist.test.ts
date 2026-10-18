import { expect, it } from "vitest";
import { replaceChecklist } from "../../agent/lib/task-checklist";

it("preserves exact task state and rejects overwriting a newer checklist or duplicate IDs", () => {
  const first = replaceChecklist({ revision: 0, items: [] }, 0, [
    { id: "a", text: "Inspect retained sources", status: "in_progress" },
    { id: "b", text: "Verify the answer", status: "pending" },
  ]);
  const next = replaceChecklist(first, 1, first.items.map(item => ({ ...item,
    status: item.id === "a" ? "completed" : "in_progress" })));
  expect(next.revision).toBe(2);
  expect(first.items[0].status).toBe("in_progress");
  expect(() => replaceChecklist(next, 1, [])).toThrow("changed");
  expect(() => replaceChecklist(next, 2, [first.items[0], first.items[0]])).toThrow("unique");
});
