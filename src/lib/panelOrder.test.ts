import { describe, expect, it } from "vitest";
import { applyPanelOrder, movePanel } from "./panelOrder";

describe("panel insertion ordering", () => {
  it("moves the fifth panel to second and shifts the others, without changing the original", () => {
    const ids = ["a", "b", "c", "d", "e"];
    expect(movePanel(ids, "e", 1)).toEqual(["a", "e", "b", "c", "d"]);
    expect(ids).toEqual(["a", "b", "c", "d", "e"]);
    expect(movePanel(ids, "a", 4)).toEqual(["b", "c", "d", "e", "a"]);
    expect(movePanel(ids, "missing", 1)).toBe(ids);
  });
  it("preserves other workspaces and the original objects containing drafts", () => {
    const a = { id: "a", draft: "unsent" };
    const other = { id: "other", draft: "other workspace" };
    const b = { id: "b", draft: "" };
    const result = applyPanelOrder([a, other, b], ["b", "a"]);
    expect(result).toEqual([b, other, a]);
    expect(result[2]).toBe(a);
    expect(result[1]).toBe(other);
  });
  it("does not remove newly opened panels or resurrect closed panels", () => {
    expect(applyPanelOrder([{ id: "a" }, { id: "new" }, { id: "b" }], ["b", "closed", "a"]))
      .toEqual([{ id: "b" }, { id: "new" }, { id: "a" }]);
  });
});
