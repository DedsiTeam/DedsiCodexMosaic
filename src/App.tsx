import { version } from "../package.json";
import { useEffect } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Columns3,
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
} from "./lib/state";
import { DeleteThreadButton } from "./components/DeleteThreadButton";
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher";
import { ChatPanel } from "./components/ChatPanel";
import { FullscreenButton } from "./components/FullscreenButton";
import { IconButton, Logo } from "./components/ui";
export default function App() {
  const state = useStore();
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
  }, [state.active]);
  const visiblePanels = state.panels.filter(
    (p) => sameWorkspace(p.cwd, state.cwd) || (!p.cwd && !state.cwd),
  );
  const workspaceThreads = state.threads.filter((t) =>
    belongsToWorkspace(t.cwd, state.cwd),
  );
  const running = visiblePanels.filter(
    (p) => p.threadId && state.sessions[p.threadId]?.busy,
  ).length;
  return (
    <MotionConfig reducedMotion="user">
      <Tooltip.Provider delayDuration={250}>
        <div className="app-shell">
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
                <IconButton label="新建对话" onClick={addPanel}>
                  <Plus size={20} />
                </IconButton>
                <IconButton label="打开会话列表" onClick={toggleSidebar}>
                  <MessageSquare size={18} />
                </IconButton>
              </div>
            ) : (
              <>
                <WorkspaceSwitcher />
                <div className="sidebar-actions">
                  <button className="new-chat" onClick={addPanel}>
                    <Plus size={17} />
                    新建对话
                  </button>
                </div>
                <div className="section-label">
                  <span>
                    最近
                  </span>
                  <IconButton
                    label="刷新会话列表"
                    disabled={state.listing || state.connection !== "connected"}
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
                  {!workspaceThreads.length && (
                    <div className="sidebar-empty">
                      <MessageSquare size={21} />
                      <p>
                        {state.connection === "preview"
                          ? "在桌面应用中连接 Codex\n即可查看历史会话"
                          : !state.cwd
                            ? "请先选择工作目录"
                            : state.listing
                              ? "正在读取会话…"
                              : "还没有历史会话"}
                      </p>
                    </div>
                  )}
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
              <div>
                <span className="view-label">
                  <Columns3 size={15} />
                  横向工作台
                </span>
                <span className="count-label">
                  {visiblePanels.length} 个对话
                </span>
                {running > 0 && (
                  <span className="count-label running">
                    {running} 个执行中
                  </span>
                )}
              </div>
              <FullscreenButton />
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
            <div className="panel-track" aria-label="横向对话工作区">
              {visiblePanels.map((panel, index) => (
                <ChatPanel key={panel.id} panel={panel} index={index} />
              ))}
              {visiblePanels.length === 0 && (
                <div className="workspace-empty">
                  <MessageSquare size={28} aria-hidden="true" />
                  <h2>还没有打开的对话</h2>
                  <p>从左侧新建对话，或选择一个历史会话。</p>
                </div>
              )}
            </div>
          </main>

        </div>
      </Tooltip.Provider>
    </MotionConfig>
  );
}
