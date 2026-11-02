export function movePanel(ids: string[], id: string, targetIndex: number) {
  if (!ids.includes(id)) return ids;
  const next = ids.filter((value) => value !== id);
  next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, id);
  return next;
}

// Replace only the selected workspace's slots; preserve every other panel.
export function applyPanelOrder<T extends { id: string }>(panels: T[], ids: string[]) {
  const selected = new Set(ids);
  const byId = new Map(panels.map((panel) => [panel.id, panel]));
  const ordered = [...selected].map((id) => byId.get(id)).filter((panel): panel is T => !!panel);
  let index = 0;
  return panels.map((panel) => selected.has(panel.id) ? ordered[index++] : panel);
}
