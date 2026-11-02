import { describe, expect, it } from "vitest";
import { fitsLayout, layoutRowHeight } from "./layouts";

describe("layout space constraints", () => {
  it("accounts for column gaps and the smaller primary column", () => {
    expect(fitsLayout("two", 823, 700, 400)).toBe(false);
    expect(fitsLayout("two", 824, 700, 400)).toBe(true);
    expect(fitsLayout("primary", 1223, 700, 400)).toBe(false);
    expect(fitsLayout("primary", 1224, 700, 400)).toBe(true);
    expect(fitsLayout("three", 1247, 700, 400)).toBe(false);
    expect(fitsLayout("three", 1248, 700, 400)).toBe(true);
  });
  it("requires room for both rows and always allows free layout", () => {
    expect(fitsLayout("four", 824, 663, 400)).toBe(false);
    expect(fitsLayout("four", 824, 664, 400)).toBe(true);
    expect(fitsLayout("free", 300, 200, 400)).toBe(true);
  });
});

describe("continuous layout", () => {
  it("keeps rows readable instead of shrinking to fit all conversations", () => {
    expect(layoutRowHeight("four", 904)).toBe(440);
    expect(layoutRowHeight("two", 904)).toBe(904);
    expect(layoutRowHeight("three", 200)).toBe(320);
    expect(layoutRowHeight("four", 664)).toBe(320);
  });
});
