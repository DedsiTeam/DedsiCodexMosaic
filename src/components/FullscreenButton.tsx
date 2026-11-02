import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize, Minimize } from "lucide-react";
import { desktop } from "../lib/client";
import { update } from "../lib/state";

export function FullscreenButton({
  onFullscreenChange,
}: {
  onFullscreenChange: (fullscreen: boolean) => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [busy, setBusy] = useState(false);
  const changing = useRef(false);
  useEffect(() => {
    onFullscreenChange(fullscreen);
  }, [fullscreen, onFullscreenChange]);
  const reportError = (error: unknown) =>
    update({ error: `无法切换全屏：${String(error)}` });

  const changeFullscreen = useCallback(async (exitOnly = false) => {
    if (!desktop || changing.current) return;
    changing.current = true;
    setBusy(true);
    try {
      const appWindow = getCurrentWindow();
      const current = await appWindow.isFullscreen();
      const next = exitOnly ? false : !current;
      if (current !== next) await appWindow.setFullscreen(next);
      setFullscreen(await appWindow.isFullscreen());
    } catch (error) {
      reportError(error);
    } finally {
      changing.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    const appWindow = getCurrentWindow();
    const sync = async () => {
      try {
        const value = await appWindow.isFullscreen();
        if (!disposed) setFullscreen(value);
      } catch (error) {
        if (!disposed) reportError(error);
      }
    };
    void sync();
    const unlisten = appWindow.onResized(() => void sync());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if (event.key === "F11") {
        event.preventDefault();
        void changeFullscreen();
      } else if (event.key === "Escape") {
        void changeFullscreen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("focus", sync);
    return () => {
      disposed = true;
      void unlisten.then((stop) => stop()).catch(() => {});
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("focus", sync);
    };
  }, [changeFullscreen]);

  if (!desktop) return null;
  const label = fullscreen ? "退出全屏" : "进入全屏";
  return (
    <button
      className="fullscreen-button"
      onClick={() => void changeFullscreen()}
      disabled={busy}
      title={`${label}（F11；Esc 退出全屏）`}
      aria-label={label}
      aria-keyshortcuts="F11"
    >
      {fullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
    </button>
  );
}
