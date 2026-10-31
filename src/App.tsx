import { version } from "../package.json";
import { useEffect, useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  RefreshCw,
  ChevronRight,
  FolderOpen,
  Columns3,
  X,
  Check,
  Terminal,
  MessageSquare,
} from "lucide-react";
import { Dialog } from "@animate-ui/react/primitives/radix-ui/dialog";
import { Tooltip } from "@animate-ui/react/primitives/radix-ui/tooltip";
import { motion, MotionConfig } from "motion/react";
import { open } from "@tauri-apps/plugin-dialog";
import { desktop } from "./lib/client";
import {
  addPanel,
  setWorkspace,
  sameWorkspace,
  belongsToWorkspace,
  boot,
  openThread,
  persist,
  reconnect,
  refreshThreads,
  toggleSidebar,
  update,
  useStore,
} from "./lib/state";
import { DeleteThreadButton } from "./components/DeleteThreadButton";
import { ChatPanel } from "./components/ChatPanel";
import { IconButton, Logo } from "./components/ui";
export default function App() {
  const state = useStore();
  const [settings, setSettings] = useState(false);
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
  const selectFolder = async () => {
    try {
      const path = await open({
        directory: true,
        multiple: false,
        defaultPath: state.cwd || undefined,
      });
      if (typeof path === "string") {
        setWorkspace(path);
      }
    } catch (e) {
      update({ error: String(e) });
    }
  };
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
                <IconButton label="新建对话" onClick={addPanel}>
                  <Plus size={20} />
                </IconButton>
                <IconButton label="打开会话列表" onClick={toggleSidebar}>
                  <MessageSquare size={18} />
                </IconButton>
              </div>
            ) : (
              <>
                <div className="workspace-switch">
                  <span className="workspace-icon">
                    <FolderOpen size={18} />
                  </span>
                  <div>
                    <strong>
                      {state.cwd.split(/[\\/]/).filter(Boolean).pop() ||
                        "本地工作区"}
                    </strong>
                    <small>LOCAL WORKSPACE</small>
                  </div>
                  <IconButton
                    label="选择默认工作目录"
                    disabled={!desktop}
                    onClick={() => void selectFolder()}
                  >
                    <ChevronRight size={15} />
                  </IconButton>
                </div>
                <div className="sidebar-actions">
                  <button className="primary new-chat" onClick={addPanel}>
                    <Plus size={17} />
                    新建对话
                  </button>
                </div>
                <div className="section-label">
                  <span>
                    最近会话 <b>{workspaceThreads.length}</b>
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
                            <small>
                              {thread.cwd
                                .split(/[\\/]/)
                                .filter(Boolean)
                                .pop() || "本地"}
                              {panel ? " · 已打开" : ""}
                            </small>
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
              <IconButton label="设置" onClick={() => setSettings(true)}>
                <Settings size={18} />
              </IconButton>
              {!state.collapsed && <span>设置</span>}
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
          <Dialog.Root open={settings} onOpenChange={setSettings}>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="dialog-content">
                <div className="dialog-heading">
                  <Dialog.Title>工作台设置</Dialog.Title>
                  <Dialog.Close asChild>
                    <button className="icon-button" aria-label="关闭设置">
                      <X size={18} />
                    </button>
                  </Dialog.Close>
                </div>
                <Dialog.Description>
                  连接本机 Codex，配置新对话的默认工作目录。
                </Dialog.Description>
                <label>
                  Codex 可执行文件
                  <input
                    placeholder="留空自动查找，或填写完整路径"
                    value={state.executable}
                    disabled={state.connection === "connected"}
                    onChange={(e) => {
                      update({ executable: e.target.value });
                      persist();
                    }}
                  />
                </label>
                {state.executableResolved && (
                  <small className="resolved-path">
                    已连接：{state.executableResolved}
                  </small>
                )}
                <p className="settings-help">
                  使用本机 Codex 的登录状态。首次使用请在终端运行{" "}
                  <code>codex login</code>。连接后修改可执行文件需要重启应用。
                </p>
                <label>
                  默认工作目录
                  <div className="input-with-button">
                    <input
                      placeholder="选择本地项目目录"
                      key={state.cwd}
                      defaultValue={state.cwd}
                      onBlur={(e) => setWorkspace(e.target.value.trim())}
                    />
                    <button
                      disabled={!desktop}
                      onClick={() => void selectFolder()}
                    >
                      <FolderOpen size={16} />
                    </button>
                  </div>
                </label>
                <div className="theme-preview">
                  <span>
                    <i /> #9FED72
                  </span>
                  <span>黑色 / 白色</span>
                  <Check size={16} />
                </div>
                <div className="settings-footer">
                  <span>
                    {desktop ? "本地进程 · stdio 连接" : "浏览器预览模式"}
                  </span>
                  <button
                    className="primary"
                    disabled={
                      !desktop ||
                      state.connection === "connected" ||
                      state.connection === "connecting"
                    }
                    onClick={() => void reconnect()}
                  >
                    {state.connection === "connected" ? "已连接" : "连接 Codex"}
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </Tooltip.Provider>
    </MotionConfig>
  );
}
