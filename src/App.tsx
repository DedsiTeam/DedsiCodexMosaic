import { version } from "../package.json";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  X,
  Terminal,
  MessageSquare,
} from "lucide-react";
import { Tooltip } from "@animate-ui/react/primitives/radix-ui/tooltip";
import { motion, MotionConfig } from "motion/react";
import {
  addPanel,
  sameWorkspace,
  belongsToWorkspace,
  boot,
  openThread,
  reconnect,
  refreshThreads,
  toggleSidebar,
  update,
  useStore,
  MIN_PANEL_WIDTH,
} from "./lib/state";
import { DeleteThreadButton } from "./components/DeleteThreadButton";
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher";
import { ChatPanel } from "./components/ChatPanel";
import { FullscreenButton } from "./components/FullscreenButton";
import { LayoutPicker } from "./components/LayoutPicker";
import { fitsLayout, layoutRowHeight, LAYOUTS, type Layout } from "./lib/layouts";
import { usePanelSort } from "./components/usePanelSort";
import { IconButton, Logo } from "./components/ui";
export default function App() {
  const state = useStore();
  const [fullscreen, setFullscreen] = useState(false);
  const [layout, setLayout] = useState<Layout>("free");
  const track = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!track.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const element = entry.target as HTMLElement;
      setSpace({ width: entry.contentRect.width + element.offsetWidth - element.clientWidth, height: entry.contentRect.height });
    });
    observer.observe(track.current);
    return () => observer.disconnect();
  }, []);
  // Reserve the 7px vertical scrollbar consistently, including before switching layouts.
  const available = LAYOUTS.filter((item) => fitsLayout(item.id, space.width - 7, space.height, MIN_PANEL_WIDTH)).map((item) => item.id);
  const effectiveLayout = available.includes(layout) ? layout : "free";
  const slots = LAYOUTS.find((item) => item.id === effectiveLayout)!.slots;
  useEffect(() => {
    void boot().catch((e) =>
      update({ connection: "disconnected", error: String(e) }),
    );
  }, []);
  useEffect(() => {
    document.getElementById(`panel-${state.active}`)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [state.active, effectiveLayout]);
  const visiblePanels = state.panels.filter(
    (p) => sameWorkspace(p.cwd, state.cwd) || (!p.cwd && !state.cwd),
  );
  const sorting = usePanelSort(track, visiblePanels.map((panel) => panel.id), `${state.cwd}|${effectiveLayout}|${fullscreen}`);
  const selectLayout = (next: Layout) => {
    setLayout(next);
    if (track.current) track.current.scrollTo({ left: 0, top: 0 });
  };
  const workspaceThreads = state.threads.filter((t) =>
    belongsToWorkspace(t.cwd, state.cwd),
  );
  const running = visiblePanels.filter(
    (p) => p.threadId && state.sessions[p.threadId]?.busy,
  ).length;
  return (
    <MotionConfig reducedMotion="user">
      <Tooltip.Provider delayDuration={250}>
        <div className={`app-shell${fullscreen ? " is-fullscreen" : ""}`}>
          <motion.aside
            className="sidebar"
            animate={{ width: state.collapsed ? 66 : 248 }}
            transition={{ duration: 0.2 }}
            aria-label="会话菜单"
          >
            <div className="brand" title={`DedsiCodexMosaic v${version}`}>
              <Logo />
              {!state.collapsed && (
                <div>
                  DedsiCodexMosaic<span>v{version}</span>
                </div>
              )}
            </div>
            {state.collapsed ? (
              <div className="sidebar-rail">
                <WorkspaceSwitcher collapsed />
                {state.cwd && (
                  <IconButton label="新建对话" onClick={addPanel}>
                    <Plus size={20} />
                  </IconButton>
                )}
                <IconButton label="打开会话列表" onClick={toggleSidebar}>
                  <MessageSquare size={18} />
                </IconButton>
              </div>
            ) : (
              <>
                <WorkspaceSwitcher />
                {state.cwd && (
                  <div className="sidebar-actions">
                    <button className="new-chat" onClick={addPanel}>
                      <Plus size={17} />
                      新建对话
                    </button>
                  </div>
                )}
                {workspaceThreads.length > 0 && (
                  <>
                    <div className="section-label">
                      <span>最近</span>
                      <IconButton
                        label="刷新会话列表"
                        disabled={
                          state.listing || state.connection !== "connected"
                        }
                        onClick={() => void refreshThreads()}
                      >
                        <RefreshCw
                          size={13}
                          className={state.listing ? "spin" : ""}
                        />
                      </IconButton>
                    </div>
                    <nav className="thread-list">
                      {workspaceThreads.map((thread) => {
                        const panel = state.panels.find(
                          (p) => p.threadId === thread.id,
                        );
                        const session = state.sessions[thread.id];
                        return (
                          <div key={thread.id} className="thread-entry">
                            <button
                              className={`thread-row ${panel?.id === state.active ? "selected" : ""}`}
                              onClick={() => openThread(thread)}
                            >
                              <span
                                className={`thread-dot ${session?.busy ? "running" : ""}`}
                              />
                              <span>
                                <strong>
                                  {thread.name ||
                                    thread.preview.slice(0, 45) ||
                                    "未命名对话"}
                                </strong>
                              </span>
                              {session?.approvals.length ? (
                                <span className="approval-count">!</span>
                              ) : null}
                            </button>
                            <DeleteThreadButton
                              threadId={thread.id}
                              title={
                                thread.name ||
                                thread.preview.slice(0, 45) ||
                                "未命名对话"
                              }
                              disabled={state.connection !== "connected"}
                            />
                          </div>
                        );
                      })}
                      {state.threadCursor && (
                        <button
                          className="load-more"
                          disabled={state.listing}
                          onClick={() => void refreshThreads(true)}
                        >
                          加载更多
                        </button>
                      )}
                    </nav>
                  </>
                )}
              </>
            )}
            <div
              className={`sidebar-bottom ${state.collapsed ? "collapsed" : ""}`}
            >
              <IconButton
                label={state.collapsed ? "展开侧栏" : "折叠侧栏"}
                onClick={toggleSidebar}
              >
                {state.collapsed ? (
                  <PanelLeftOpen size={18} />
                ) : (
                  <PanelLeftClose size={18} />
                )}
              </IconButton>
            </div>
          </motion.aside>
          <main className="workspace">
            <div className="workspace-toolbar">
              <div className="workspace-summary">
                <span className="count-label">
                  {visiblePanels.length} 个对话
                </span>
                {running > 0 && (
                  <span className="count-label running">
                    {running} 个执行中
                  </span>
                )}
              </div>
              <div className="workspace-controls">
                <LayoutPicker layout={effectiveLayout} available={available} onChange={selectLayout} />
                <FullscreenButton onFullscreenChange={setFullscreen} />
              </div>
            </div>
            {state.connection === "preview" && (
              <div className="notice">
                <Terminal size={15} />
                <span>
                  当前为界面预览。运行 <code>bun run desktop</code> 连接本机
                  Codex，开始真实对话。
                </span>
              </div>
            )}
            {state.error && (
              <div className="notice error" role="alert">
                <span>{state.error}</span>
                {state.connection === "disconnected" && (
                  <button onClick={() => void reconnect()}>重新连接</button>
                )}
                <IconButton
                  label="关闭提示"
                  onClick={() => update({ error: undefined })}
                >
                  <X size={14} />
                </IconButton>
              </div>
            )}
            <motion.div layoutScroll ref={track} className={`panel-track layout-${effectiveLayout}${sorting.drag ? " is-sorting" : ""}`} aria-label="对话工作区"
              style={{ "--layout-row-height": `${layoutRowHeight(effectiveLayout, space.height)}px` } as CSSProperties}>
              {visiblePanels.map((panel, index) => (
                <ChatPanel key={panel.id} panel={panel} index={index} fullscreen={fullscreen}
                  tiled={slots > 0} order={sorting.ordered.indexOf(panel.id)}
                  sorting={sorting.drag?.id === panel.id} onSortStart={sorting.start} />
              ))}
              {visiblePanels.length === 0 && (
                <div className="workspace-empty">
                  <MessageSquare size={28} aria-hidden="true" />
                  <h2>{state.cwd ? "还没有打开的对话" : "请先选择项目"}</h2>
                  <p>
                    {state.cwd
                      ? "从左侧新建对话，或选择一个历史会话。"
                      : "从左侧选择项目后，即可新建对话或查看历史会话。"}
                  </p>
                </div>
              )}
            </motion.div>
            {sorting.drag && <div className="panel-drag-preview" role="status"
              style={{ left: Math.min(sorting.drag.x + 16, window.innerWidth - 240), top: Math.min(sorting.drag.y + 16, window.innerHeight - 70) }}>
              <strong>{sorting.drag.title}</strong>
              <span>移至第 {sorting.drag.position} 位 · Esc 取消</span>
            </div>}
          </main>
        </div>
      </Tooltip.Provider>
    </MotionConfig>
  );
}
