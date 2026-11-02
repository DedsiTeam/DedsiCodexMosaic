import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { movePanel } from "../lib/panelOrder";
import { reorderPanels, update } from "../lib/state";

type Drag = { id: string; title: string; x: number; y: number; position: number };

export function usePanelSort(track: RefObject<HTMLDivElement | null>, ids: string[], context: string) {
  const [preview, setPreview] = useState<string[] | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const signature = ids.join("|");
  useEffect(() => () => { cleanup.current?.(); }, [context, signature]);

  const start = (event: ReactPointerEvent<HTMLElement>, id: string, title: string) => {
    if (event.button !== 0 || !event.isPrimary || !track.current) return;
    if ((event.target as HTMLElement).closest("button:not(.panel-drag-handle), input, a")) return;
    event.preventDefault();
    event.stopPropagation();
    cleanup.current?.();
    const container = track.current;
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX, startY = event.clientY;
    let x = startX, y = startY, started = false, frame = 0;
    let result = ids;
    const initialLeft = container.scrollLeft, initialTop = container.scrollTop;
    const rectangles = ids.map((value) => document.getElementById(`panel-${value}`)!.getBoundingClientRect());
    const oldCursor = document.body.style.cursor;
    const oldSelect = document.body.style.userSelect;
    handle.setPointerCapture(pointerId);

    const finish = (commit: boolean) => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
      handle.removeEventListener("lostpointercapture", cancel);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      document.body.style.cursor = oldCursor;
      document.body.style.userSelect = oldSelect;
      cleanup.current = null;
      setDrag(null);
      setPreview(null);
      if (commit && started) reorderPanels(result);
      if (commit && !started) update({ active: id });
    };
    const cancel = () => finish(false);
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const bounds = container.getBoundingClientRect();
      finish(e.clientX >= bounds.left && e.clientX <= bounds.right && e.clientY >= bounds.top && e.clientY <= bounds.bottom);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); finish(false); }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      x = e.clientX; y = e.clientY;
      if (!started && Math.hypot(x - startX, y - startY) >= 6) {
        started = true;
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }
    };
    let lastTime = performance.now();
    const tick = (time: number) => {
      const delta = Math.min(32, time - lastTime) / 1000;
      lastTime = time;
      if (started) {
        const bounds = container.getBoundingClientRect();
        const speed = (value: number, low: number, high: number) =>
          value < low + 64 ? -Math.min(1, (low + 64 - value) / 64) * 650 :
          value > high - 64 ? Math.min(1, (value - high + 64) / 64) * 650 : 0;
        if (x >= bounds.left - 40 && x <= bounds.right + 40 && y >= bounds.top - 40 && y <= bounds.bottom + 40) {
          container.scrollLeft += speed(x, bounds.left, bounds.right) * delta;
          container.scrollTop += speed(y, bounds.top, bounds.bottom) * delta;
        }
        const px = x + container.scrollLeft - initialLeft;
        const py = y + container.scrollTop - initialTop;
        let target = 0, distance = Infinity;
        rectangles.forEach((rect, index) => {
          // Distance to slot center, normalized for tall cards and wide columns.
          const score = ((px - rect.left - rect.width / 2) / rect.width) ** 2
            + ((py - rect.top - rect.height / 2) / rect.height) ** 2;
          if (score < distance) { distance = score; target = index; }
        });
        const next = movePanel(ids, id, target);
        if (next.join("|") !== result.join("|")) result = next;
        setPreview((current) => current?.join("|") === result.join("|") ? current : result);
        setDrag({ id, title, x, y, position: target + 1 });
      }
      frame = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    handle.addEventListener("lostpointercapture", cancel);
    cleanup.current = cancel;
    frame = requestAnimationFrame(tick);
  };
  return { ordered: preview ?? ids, drag, start };
}
