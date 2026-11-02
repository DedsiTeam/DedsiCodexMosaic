export type Layout = "free" | "two" | "primary" | "three" | "four";
export const LAYOUTS: { id: Layout; label: string; slots: number; columns: number; rows: number }[] = [
  { id: "free", label: "自由横排", slots: 0, columns: 1, rows: 1 },
  { id: "two", label: "双栏均分", slots: 2, columns: 2, rows: 1 },
  { id: "primary", label: "主次双栏", slots: 2, columns: 2, rows: 1 },
  { id: "three", label: "三栏均分", slots: 3, columns: 3, rows: 1 },
  { id: "four", label: "四宫格", slots: 4, columns: 2, rows: 2 },
];

export function fitsLayout(layout: Layout, width: number, height: number, minWidth: number) {
  if (layout === "free") return true;
  const spec = LAYOUTS.find((item) => item.id === layout)!;
  // Primary's smaller column is one third of the width after the gap.
  const requiredWidth = layout === "primary"
    ? minWidth * 3 + 24
    : minWidth * spec.columns + 24 * (spec.columns - 1);
  return width >= requiredWidth && (spec.rows === 1 || height >= 320 * 2 + 24);
}

export function layoutRowHeight(layout: Layout, height: number) {
  return Math.max(320, layout === "four" ? (height - 24) / 2 : height);
}
