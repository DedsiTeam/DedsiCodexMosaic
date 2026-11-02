import { useCallback, useEffect, useRef, useState } from "react";
import { Diamond, RefreshCw } from "lucide-react";
import { Popover } from "@animate-ui/react/primitives/radix-ui/popover";
import { Tooltip } from "@animate-ui/react/primitives/radix-ui/tooltip";
import { onEvent, rpc } from "../lib/client";
import { useStore } from "../lib/state";
import { remainingPercent, usageBuckets, windowLabel } from "../lib/usage";
import type { GetAccountRateLimitsResponse } from "../protocol/v2/GetAccountRateLimitsResponse";

export function UsagePopover() {
  const { connection } = useStore();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<GetAccountRateLimitsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const pending = useRef(false);
  const refresh = useCallback(async () => {
    if (connection !== "connected" || pending.current) return;
    const request = generation.current;
    pending.current = true;
    setLoading(true);
    try {
      const result = await rpc<GetAccountRateLimitsResponse>("account/rateLimits/read");
      if (request !== generation.current) return;
      setData(result);
      setError("");
    } catch (e) {
      if (request === generation.current) setError(`无法读取额度：${String(e)}`);
    } finally {
      if (request === generation.current) {
        pending.current = false;
        setLoading(false);
      }
    }
  }, [connection]);

  useEffect(() => {
    generation.current++;
    pending.current = false;
    setData(null);
    setError("");
    setLoading(false);
    if (connection !== "connected") return;
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);
    const unlisten = onEvent((event) => {
      if (event.method === "account/updated") {
        generation.current++;
        pending.current = false;
        setData(null);
        void refresh();
      } else if (event.method === "account/rateLimits/updated") {
        void refresh();
      }
    });
    return () => {
      generation.current++;
      window.clearInterval(interval);
      void unlisten.then((stop) => stop()).catch(() => {});
    };
  }, [connection, refresh]);

  const buckets = data ? usageBuckets(data) : [];
  const windows = buckets.flatMap((bucket) => [bucket.primary, bucket.secondary])
    .filter((window) => !!window);
  const remaining = windows.map(remainingPercent).filter((value) => value !== null);
  const percent = remaining.length ? Math.min(...remaining) : null;
  const limitingWindow = windows.find((window) => remainingPercent(window) === percent);
  const period = limitingWindow ? windowLabel(limitingWindow, windows.indexOf(limitingWindow)).replace(/额度$/, "") : "额度";
  const label = error ? "额度更新失败" : percent === null ? "查看额度" : `${period} · 剩余 ${percent}%`;
  return (
    <Popover.Root open={open} onOpenChange={(next) => { setOpen(next); if (next) void refresh(); }}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
      <Popover.Trigger className="usage-trigger" aria-label={label}>
        <svg className="usage-ring" viewBox="0 0 32 32" aria-hidden="true">
          <circle className="usage-ring-track" cx="16" cy="16" r="13" />
          {percent !== null && <circle className="usage-ring-value" cx="16" cy="16" r="13" pathLength="100" strokeDasharray={`${percent} 100`} transform="rotate(-90 16 16)" />}
          <Diamond x="10" y="10" width="12" height="12" />
        </svg>
      </Popover.Trigger>
        </Tooltip.Trigger>
        {!open && <Tooltip.Portal>
          <Tooltip.Content className="tooltip usage-tooltip" side="right" sideOffset={8}>
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>}
      </Tooltip.Root>
      <Popover.Portal>
        <Popover.Content className="usage-popover" side="top" align="start" sideOffset={12} collisionPadding={12} aria-label="账号额度">
          <div className="usage-heading">
            <span>{buckets[0]?.planType && buckets[0].planType !== "unknown" ? `${buckets[0].planType === "prolite" ? "Pro Lite" : buckets[0].planType} 套餐` : "账号额度"}</span>
            <button className="icon-button" aria-label="刷新额度" disabled={loading || connection !== "connected"} onClick={() => void refresh()}>
              <RefreshCw size={14} className={loading ? "spin" : ""} />
            </button>
          </div>
          <div aria-live="polite">
            {connection !== "connected" && <p className="usage-message">{connection === "preview" ? "界面预览不提供真实额度，请在桌面应用连接 Codex。" : "连接 Codex 后可查看账号额度。"}</p>}
            {loading && !data && <p className="usage-message">正在读取额度…</p>}
            {error && <p className="usage-message" role="alert">{error}{data ? "（下方为上次读取的数据）" : "；请确认已登录且账号支持额度查询。"}</p>}
            {buckets.map((bucket, index) => <section className="usage-bucket" key={bucket.limitId ?? index}>
              {buckets.length > 1 && <strong>{bucket.limitName || bucket.limitId || "Codex"}</strong>}
              {[bucket.primary, bucket.secondary].map((window, i) => {
                if (!window) return null;
                const left = remainingPercent(window);
                const reset = window.resetsAt ? new Date(window.resetsAt * 1000) : null;
                return <div className="usage-window" key={i}>
                  <div className="usage-row"><span>{windowLabel(window, i)}</span><span>{left === null ? "暂无数据" : `剩余 ${left}%`}</span></div>
                  {left !== null && <progress max={100} value={left} aria-label={`${windowLabel(window, i)}剩余`} />}
                  {reset && Number.isFinite(reset.getTime()) && <small title={reset.toLocaleString()}>{reset.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })} 重置</small>}
                </div>;
              })}
              {!bucket.primary && !bucket.secondary && <p className="usage-message">服务端未提供额度窗口。</p>}
              <div className="usage-row"><span>Credits</span><span>{!bucket.credits ? "暂无数据" : bucket.credits.unlimited ? "不限量" : bucket.credits.balance ?? (bucket.credits.hasCredits ? "有可用额度" : "0")}</span></div>
            </section>)}
            {data && !buckets.length && <p className="usage-message">暂无额度数据。</p>}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
