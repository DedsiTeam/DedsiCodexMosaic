import { useEffect, useRef, useState } from "react";
import {
  Paperclip,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  FolderOpen,
  MoreHorizontal,
  Square,
  Terminal,
  X,
  FileCode2,
  GripVertical,
} from "lucide-react";
import { Collapsible } from "@animate-ui/react/primitives/radix-ui/collapsible";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { open } from "@tauri-apps/plugin-dialog";
import { desktop, saveAttachment } from "../lib/client";
import {
  DEFAULT_MODEL,
  getState,
  closePanel,
  emptySession,
  interrupt,
  loadThread,
  patchPanel,
  send,
  update,
  useStore,
  type Message,
  type Panel,
} from "../lib/state";
import { AttachmentView } from "./Attachments";
import { GitEnvironment } from "./GitEnvironment";
import { Approval } from "./Approval";
import { IconButton, Logo } from "./ui";
function MessageView({ message }: { message: Message }) {
  if (message.kind === "userMessage")
    return (
      <div className="user-message">
        <div className="message-label">你</div>
        <div>{message.text}</div>
        {!!message.attachments?.length && (
          <div className="attachment-list">
            {message.attachments.map((file) => (
              <AttachmentView key={file.id} file={file} />
            ))}
          </div>
        )}
      </div>
    );
  if (message.kind === "agentMessage" || message.kind === "plan")
    return (
      <div className="agent-message">
        <div className="message-label">
          <Logo small /> {message.kind === "plan" ? "计划" : "CODEX"}
        </div>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ children, href }) => (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
            img: ({ alt }) => <span>[图片：{alt}]</span>,
          }}
        >
          {message.text}
        </ReactMarkdown>
      </div>
    );
  return (
    <Collapsible.Root className="tool-card">
      <Collapsible.Trigger className="tool-trigger">
        {message.kind === "commandExecution" ? (
          <Terminal size={14} />
        ) : message.kind === "fileChange" ? (
          <FileCode2 size={14} />
        ) : (
          <MoreHorizontal size={14} />
        )}
        <span>{message.text}</span>
        <ChevronDown size={13} />
      </Collapsible.Trigger>
      <Collapsible.Content>
        <pre>{message.detail || "等待结果…"}</pre>
        {message.status && <small>{message.status}</small>}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
export function ChatPanel({ panel, index }: { panel: Panel; index: number }) {
  const state = useStore();
  const session = panel.threadId
    ? state.sessions[panel.threadId] || emptySession()
    : emptySession();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const uploadLock = useRef(false);
  const addFiles = async (files: File[]) => {
    if (uploadLock.current || submitting || !desktop) return;
    uploadLock.current = true;
    setUploading(true);
    setAttachmentError("");
    try {
      for (const file of files) {
        const current = getState().panels.find((p) => p.id === panel.id);
        if (!current) break;
        if ((current.attachments?.length || 0) >= 10)
          throw new Error("每条消息最多添加 10 个附件。");
        if (file.size > 25 * 1024 * 1024)
          throw new Error(`${file.name} 超过 25 MB，未添加。`);
        const id = crypto.randomUUID();
        const name = file.name || `截图-${Date.now()}.png`;
        const path = await saveAttachment(
          id,
          name,
          Array.from(new Uint8Array(await file.arrayBuffer())),
        );
        const latest = getState().panels.find((p) => p.id === panel.id);
        if (!latest) break;
        const extension = name.split(".").pop()?.toLowerCase();
        const mime =
          file.type ||
          (
            {
              png: "image/png",
              jpg: "image/jpeg",
              jpeg: "image/jpeg",
              webp: "image/webp",
              gif: "image/gif",
            } as Record<string, string>
          )[extension || ""] ||
          "application/octet-stream";
        patchPanel(panel.id, {
          attachments: [
            ...(latest.attachments || []),
            { id, name, path, mime, size: file.size },
          ],
        });
      }
    } catch (e) {
      setAttachmentError(String(e));
    } finally {
      uploadLock.current = false;
      setUploading(false);
    }
  };
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const composing = useRef(false);
  const [atBottom, setAtBottom] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const active = state.active === panel.id;
  const status = session.approvals.length
    ? "等待确认"
    : session.busy
      ? "执行中"
      : session.loading
        ? "加载中"
        : session.readOnlyReason
          ? "只读"
          : panel.threadId
            ? "就绪"
            : "新对话";
  useEffect(() => {
    if (follow.current)
      scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [session.items, session.approvals, session.busy]);
  const chooseFolder = async () => {
    if (!desktop) return;
    try {
      const path = await open({
        directory: true,
        multiple: false,
        defaultPath: panel.cwd || undefined,
      });
      if (typeof path === "string")
        patchPanel(panel.id, {
          cwd: path,
          worktree: false,
          baseBranch: undefined,
        });
    } catch (e) {
      update({ error: String(e) });
    }
  };
  const submit = async () => {
    if (uploadLock.current || submitting) return;
    setSubmitting(true);
    follow.current = true;
    try {
      await send(panel.id);
    } finally {
      setSubmitting(false);
    }
  };
  const resize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const start = e.clientX;
    const width = panel.width;
    const target = e.currentTarget;
    const track = target.closest(".panel-track");
    const initialScroll = track?.scrollLeft || 0;
    const previousCursor = document.body.style.cursor;
    const previousSelection = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    target.dataset.resizing = "true";
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) =>
      patchPanel(panel.id, {
        width: Math.max(
          280,
          Math.round(
            width +
              ev.clientX -
              start +
              (track?.scrollLeft || 0) -
              initialScroll,
          ),
        ),
      });
    const end = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelection;
      delete target.dataset.resizing;
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      target.removeEventListener("lostpointercapture", end);
      if (target.hasPointerCapture(e.pointerId))
        target.releasePointerCapture(e.pointerId);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
    target.addEventListener("lostpointercapture", end);
  };
  return (
    <article
      id={`panel-${panel.id}`}
      className={`chat-panel ${active ? "active" : ""}`}
      style={{ width: panel.width }}
      onFocusCapture={() => update({ active: panel.id })}
      onPointerDown={() => {
        if (!active) update({ active: panel.id });
      }}
      aria-label={`对话栏 ${index + 1}`}
    >
      <header className="panel-header">
        <div className="panel-title-row">
          <span className="panel-number">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h2 title={panel.title}>{panel.title}</h2>
          <IconButton
            label="关闭此栏（不会停止任务）"
            onClick={() => closePanel(panel.id)}
          >
            <X size={16} />
          </IconButton>
        </div>
        <div className="panel-meta">
          <span
            className={`status ${session.busy || session.approvals.length ? "running" : ""}`}
          >
            <i />
            {status}
          </span>
          <button
            className="path-button"
            title={panel.executionCwd || panel.cwd || "选择工作目录"}
            disabled={
              !!panel.threadId || !!panel.executionCwd || submitting || !desktop
            }
            onClick={() => void chooseFolder()}
          >
            <FolderOpen size={12} />
            {panel.cwd.split(/[\\/]/).filter(Boolean).pop() || "选择工作目录"}
          </button>
        </div>
      </header>
      <div
        className="messages"
        ref={scroll}
        onScroll={() => {
          const el = scroll.current!;
          follow.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          setAtBottom(follow.current);
        }}
      >
        {session.cursor && (
          <button
            className="load-more"
            disabled={session.loading}
            onClick={() => {
              follow.current = false;
              void loadThread(panel.threadId!, true);
            }}
          >
            加载更早的消息
          </button>
        )}
        {session.loading && !session.items.length && (
          <p className="loading">正在读取会话…</p>
        )}
        {session.items.map((message) => (
          <MessageView key={message.id} message={message} />
        ))}
        {session.approvals.map((event) => (
          <Approval key={event.id} event={event} threadId={panel.threadId!} />
        ))}
        {session.busy && !session.approvals.length && (
          <div className="working">
            <span className="pulse" /> Codex 正在处理
          </div>
        )}
        {session.readOnlyReason && (
          <div className="inline-error">
            <strong>只读会话</strong>
            <p>{session.readOnlyReason}</p>
            <button onClick={() => void loadThread(panel.threadId!)}>
              重新连接会话
            </button>
          </div>
        )}
        {session.error && (
          <div role="alert" className="inline-error">
            <strong>未能完成操作</strong>
            <p>{session.error}</p>
            {panel.threadId && (
              <button onClick={() => void loadThread(panel.threadId!)}>
                重新加载会话
              </button>
            )}
          </div>
        )}
      </div>
      {!atBottom && (
        <button
          className="jump-bottom"
          aria-label="滚动到最新消息"
          onClick={() => {
            follow.current = true;
            scroll.current?.scrollTo({
              top: scroll.current.scrollHeight,
              behavior: "smooth",
            });
          }}
        >
          <ArrowDown size={15} />
        </button>
      )}
      <footer className="composer-wrap">
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              void addFiles(files);
            }}
          />
          {!!panel.attachments?.length && (
            <div className="attachment-list">
              {panel.attachments.map((file) => (
                <AttachmentView
                  key={file.id}
                  file={file}
                  onRemove={
                    submitting
                      ? undefined
                      : () =>
                          patchPanel(panel.id, {
                            attachments: (
                              getState().panels.find((p) => p.id === panel.id)
                                ?.attachments || []
                            ).filter((a) => a.id !== file.id),
                          })
                  }
                />
              ))}
            </div>
          )}
          {uploading && <p className="attachment-status">正在添加附件…</p>}
          {attachmentError && (
            <p role="alert" className="attachment-status">
              {attachmentError}
            </p>
          )}
          <textarea
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length) {
                e.preventDefault();
                void addFiles(files);
              }
            }}
            aria-label={`消息输入 ${index + 1}`}
            placeholder={
              state.connection === "preview"
                ? "写下任务，在桌面应用中执行…"
                : "给 Codex 一个任务…"
            }
            value={panel.draft}
            onChange={(e) => patchPanel(panel.id, { draft: e.target.value })}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !composing.current &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                if (!session.busy && !submitting) void submit();
              }
            }}
          />
          <div className="composer-tools">
            <select
              aria-label={`模型 ${index + 1}`}
              value={panel.model}
              onChange={(e) => patchPanel(panel.id, { model: e.target.value })}
              disabled={session.busy}
            >
              <option value="">{session.model || "默认模型"}</option>
              {panel.model &&
                !state.models.some((m) => m.model === panel.model) && (
                  <option value={panel.model}>
                    {panel.model === DEFAULT_MODEL
                      ? "GPT-6.1-Sol"
                      : panel.model}
                  </option>
                )}
              {state.models.map((m) => (
                <option key={m.id} value={m.model}>
                  {m.displayName}
                </option>
              ))}
            </select>
            <div className="composer-actions">
              <IconButton
                label="添加文件或图片"
                disabled={!desktop || uploading || submitting}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip size={16} />
              </IconButton>
              <GitEnvironment
                panel={panel}
                disabled={submitting || session.busy}
              />
              {session.busy ? (
                <button
                  type="button"
                  className="send"
                  aria-label="停止执行"
                  disabled={
                    !session.activeTurn || state.connection !== "connected"
                  }
                  onClick={() => void interrupt(panel.threadId!)}
                >
                  <Square size={14} />
                </button>
              ) : (
                <button
                  className="send"
                  aria-label="发送消息"
                  disabled={
                    (!panel.draft.trim() && !panel.attachments?.length) ||
                    uploading ||
                    submitting ||
                    session.loading ||
                    (!!panel.threadId && !session.writable) ||
                    state.connection !== "connected"
                  }
                >
                  <ArrowUp size={18} />
                </button>
              )}
            </div>
          </div>
        </form>
      </footer>
      <div
        className="resize-handle"
        role="separator"
        aria-label="调整列宽"
        aria-orientation="vertical"
        aria-valuenow={panel.width}
        aria-valuemin={280}
        title="左右拖动调整宽度，双击恢复默认宽度"
        tabIndex={0}
        onPointerDown={resize}
        onDoubleClick={() => patchPanel(panel.id, { width: 440 })}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            patchPanel(panel.id, {
              width: Math.max(
                280,
                panel.width + (e.key === "ArrowRight" ? 20 : -20),
              ),
            });
          }
        }}
      >
        <GripVertical size={12} />
      </div>
    </article>
  );
}
