import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Check,
  Copy,
  Paperclip,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  MoreHorizontal,
  Square,
  Undo2,
  Terminal,
  X,
  FileCode2,
  GripVertical,
} from "lucide-react";
import { Collapsible } from "@animate-ui/react/primitives/radix-ui/collapsible";
import { Select } from "@animate-ui/react/primitives/radix-ui/select";
import { Dialog } from "@animate-ui/react/primitives/radix-ui/dialog";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { desktop, saveAttachment, openLink } from "../lib/client";
import {
  DEFAULT_MODEL,
  MIN_PANEL_WIDTH,
  getState,
  closePanel,
  emptySession,
  interrupt,
  recallMessage,
  loadThread,
  patchPanel,
  send,
  update,
  useStore,
  type Message,
  type Panel,
} from "../lib/state";
import { AttachmentView } from "./Attachments";
import { ThreadContextMenu } from "./ThreadContextMenu";
import { useComposerSuggestions } from "./ComposerSuggestions";
import { GitEnvironment } from "./GitEnvironment";
import { PermissionSelector } from "./PermissionSelector";
import { Approval } from "./Approval";
import { IconButton, Logo } from "./ui";
function MessageView({ message, onRecall, disabled, cwd }: { cwd: string; message: Message; onRecall?: (message: Message) => void; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
    } catch (error) {
      update({ error: `复制失败：${String(error)}` });
    }
  };
  const markdownComponents = useMemo<Components>(() => ({
            a: ({ children, href }) => (
              <a href={href} target="_blank" rel="noreferrer" onClick={(event) => {
                if (!desktop) return;
                event.preventDefault();
                if (href) void openLink(href, cwd).catch((error) => update({ error: String(error) }));
              }}>
                {children}
              </a>
            ),
            img: ({ alt }) => <span>[图片：{alt}]</span>,
          }), [cwd]);
  if (message.kind === "userMessage")
    return (
      <div className="user-message">
        <div className="user-message-text">{message.text}</div>
        <div className="message-actions">
          {onRecall && <IconButton label="撤回并编辑" disabled={disabled} onClick={() => onRecall(message)}><Undo2 size={13} /></IconButton>}
          <IconButton label={copied ? "已复制" : "复制消息"} onClick={() => void copyMessage()}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </IconButton>
        </div>
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
          urlTransform={(url) => /^(file:\/\/|[a-zA-Z]:[\\/])/.test(url) ? url : defaultUrlTransform(url)}
          components={markdownComponents}
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
function ConversationMessages({ items, onRecall, disabled, cwd }: { cwd: string; items: Message[]; onRecall: (message: Message) => void; disabled: boolean }) {
  const groups: { id: string; process: boolean; messages: Message[] }[] = [];
  for (const message of items) {
    const process = !["userMessage", "agentMessage", "plan"].includes(message.kind);
    const previous = groups[groups.length - 1];
    if (process && previous?.process && previous.messages[0].turnId === message.turnId) {
      previous.messages.push(message);
    } else {
      groups.push({ id: message.id, process, messages: [message] });
    }
  }
  return groups.map((group) => group.process ? (
    <Collapsible.Root key={group.id} className="process-group" defaultOpen={false}>
      <Collapsible.Trigger className="tool-trigger process-trigger">
        <MoreHorizontal size={14} />
        <span>执行过程 · {group.messages.length} 项</span>
        <ChevronDown size={13} />
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div className="process-details">
          {group.messages.map((message) => <MessageView key={message.id} message={message} cwd={cwd} />)}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  ) : <MessageView cwd={cwd} key={group.id} message={group.messages[0]} onRecall={onRecall} disabled={disabled} />);
}

export function ChatPanel({ panel, index, fullscreen = false, tiled = false, hidden = false, order = 0, sorting = false, onSortStart }: { panel: Panel; index: number; fullscreen?: boolean; tiled?: boolean; hidden?: boolean; order?: number; sorting?: boolean; onSortStart?: (event: React.PointerEvent<HTMLElement>, id: string, title: string) => void }) {
  const state = useStore();
  const [fullscreenWidth, setFullscreenWidth] = useState(660);
  const panelWidth = Math.max(MIN_PANEL_WIDTH, fullscreen ? fullscreenWidth : panel.width);
  const setPanelWidth = (width: number) => {
    if (fullscreen) setFullscreenWidth(width);
    else patchPanel(panel.id, { width });
  };
  const session = panel.threadId
    ? state.sessions[panel.threadId] || emptySession()
    : emptySession();
  const fileInput = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const suggestions = useComposerSuggestions(panel, composer, state.connection === "connected", () => fileInput.current?.click());
  const [composerHeight, setComposerHeight] = useState(53);
  const composerResizeCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => composerResizeCleanup.current?.(), []);
  const resizeComposer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !composer.current) return;
    event.preventDefault();
    composerResizeCleanup.current?.();
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    const startY = event.clientY;
    const startHeight = composer.current.getBoundingClientRect().height;
    const maxHeight = Math.max(24, Math.min(400, window.innerHeight * 0.4));
    const previousCursor = document.body.style.cursor;
    const previousSelection = document.body.style.userSelect;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    target.dataset.resizing = "true";
    target.setPointerCapture(pointerId);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      setComposerHeight(Math.max(24, Math.min(maxHeight, Math.round(startHeight + startY - ev.clientY))));
    };
    const end = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelection;
      delete target.dataset.resizing;
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      target.removeEventListener("lostpointercapture", end);
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      composerResizeCleanup.current = null;
    };
    composerResizeCleanup.current = end;
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
    target.addEventListener("lostpointercapture", end);
  };
  const [recalling, setRecalling] = useState<Message | null>(null);
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
  useEffect(() => {
    if (!hidden && follow.current)
      scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [session.items, session.approvals, session.busy, hidden]);
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
    const width = panelWidth;
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
      setPanelWidth(Math.max(
          MIN_PANEL_WIDTH,
          Math.round(
            width +
              ev.clientX -
              start +
              (track?.scrollLeft || 0) -
              initialScroll,
          ),
        ));
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
    <motion.article
      layout="position"
      transition={{ layout: { type: "spring", stiffness: 420, damping: 38 } }}
      id={`panel-${panel.id}`}
      className={`chat-panel ${active ? "active" : ""}${sorting ? " sorting-source" : ""}`}
      style={{ width: tiled ? undefined : panelWidth, order }}
      hidden={hidden}
      onFocusCapture={() => {
        if (!active) update({ active: panel.id });
      }}
      onPointerDown={() => {
        if (!active) update({ active: panel.id });
      }}
      aria-label={`对话栏 ${index + 1}`}
    >
      <header className="panel-header panel-sort-header" onPointerDown={(event) => onSortStart?.(event, panel.id, panel.title)} title="拖动标题栏调整顺序，Esc 取消">
        <div className="panel-title-row">
          <ThreadContextMenu title={panel.title} threadId={panel.threadId} panelId={panel.id}>
            <h2 title={panel.title} tabIndex={0}>{panel.title}</h2>
          </ThreadContextMenu>
          <IconButton label="拖动调整顺序" className="icon-button panel-drag-handle">
            <GripVertical className="panel-sort-grip" size={14} aria-hidden="true" />
          </IconButton>
          <IconButton
            label="关闭此栏（不会停止任务）"
            onClick={() => closePanel(panel.id)}
          >
            <X size={16} />
          </IconButton>
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
        <ConversationMessages cwd={panel.executionCwd || panel.cwd} items={session.items} onRecall={setRecalling} disabled={!session.writable || session.loading || !!session.editing || submitting || state.connection !== "connected"} />
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
        <div
          className="composer-resize-handle"
          role="separator"
          aria-label="调整输入框高度"
          aria-orientation="horizontal"
          aria-valuemin={24}
          aria-valuemax={400}
          aria-valuenow={composerHeight}
          tabIndex={0}
          title="上下拖动调整输入框高度，双击恢复默认高度"
          onPointerDown={resizeComposer}
          onDoubleClick={() => setComposerHeight(53)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            const height = composer.current?.getBoundingClientRect().height ?? composerHeight;
            setComposerHeight(Math.max(24, Math.min(400, window.innerHeight * 0.4, height + (event.key === "ArrowUp" ? 20 : -20))));
          }}
        />
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
          {suggestions.menu}
          <textarea
            ref={composer}
            style={{ height: composerHeight, fontSize: Math.max(14, panel.composerFontSize ?? 14) }}
            disabled={!!session.editing}
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
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestions.open}
            aria-controls={suggestions.open ? suggestions.listId : undefined}
            aria-activedescendant={suggestions.open ? suggestions.activeId : undefined}
            onFocus={suggestions.onFocus}
            onBlur={suggestions.onBlur}
            onSelect={suggestions.onSelect}
            onChange={(e) => {
              suggestions.onChange(e.currentTarget);
              patchPanel(panel.id, { draft: e.target.value });
            }}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            onKeyDown={(e) => {
              if (!composing.current && suggestions.onKeyDown(e)) return;
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
            <div className="composer-actions composer-left">
              <IconButton
                label="添加文件或图片"
                disabled={!desktop || uploading || submitting}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip size={16} />
              </IconButton>
              <PermissionSelector panel={panel} disabled={session.busy || submitting || !!session.editing || session.loading} />
              <GitEnvironment panel={panel} disabled={submitting || session.busy} />
            </div>
            <div className="composer-actions composer-right">
            <Select.Root
              value={panel.model || "__default__"}
              onValueChange={(model) =>
                patchPanel(panel.id, { model: model === "__default__" ? "" : model })
              }
              disabled={session.busy}
            >
              <Select.Trigger className="model-select-trigger" aria-label={`模型 ${index + 1}`}>
                <Select.Value />
                <Select.Icon asChild><ChevronDown size={12} /></Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="model-select-content" position="popper" side="top" align="start" sideOffset={8} collisionPadding={12}>
                  <Select.ScrollUpButton className="model-select-scroll"><ChevronDown size={12} style={{ transform: "rotate(180deg)" }} /></Select.ScrollUpButton>
                  <Select.Viewport className="model-select-viewport">
                    {[
                      { value: "__default__", label: session.model || "默认模型" },
                      ...(panel.model && !state.models.some((m) => m.model === panel.model)
                        ? [{ value: panel.model, label: panel.model === DEFAULT_MODEL ? "GPT-6.1-Sol" : panel.model }]
                        : []),
                      ...state.models.map((m) => ({ value: m.model, label: m.displayName })),
                    ].map((model) => (
                      <Select.Item key={model.value} value={model.value} className="model-select-item">
                        <Select.ItemIndicator className="model-select-check"><Check size={12} /></Select.ItemIndicator>
                        <Select.ItemText>{model.label}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                  <Select.ScrollDownButton className="model-select-scroll"><ChevronDown size={12} /></Select.ScrollDownButton>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
              {session.busy ? (
                <button
                  type="button"
                  className="send"
                  aria-label={session.stopping ? "正在暂停" : "暂停执行"}
                  title={session.stopping ? "正在暂停…" : "暂停执行"}
                  disabled={
                    !!session.stopping || !!session.editing || state.connection !== "connected"
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
                    !!session.editing ||
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
      <Dialog.Root open={!!recalling} onOpenChange={(open) => { if (!open && !session.editing) setRecalling(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>撤回并编辑这条消息？</Dialog.Title>
            <Dialog.Description>将暂停当前执行，撤回这条消息及其后的对话记录，并将内容放回输入框。已修改的项目文件不会回滚。</Dialog.Description>
            <div className="button-row">
              <button disabled={!!session.editing} onClick={() => setRecalling(null)}>取消</button>
              <button className="primary" disabled={!!session.editing} onClick={async () => {
                if (recalling && await recallMessage(panel.id, recalling)) {
                  setRecalling(null);
                  requestAnimationFrame(() => composer.current?.focus());
                }
              }}>{session.editing ? "正在撤回…" : "撤回并编辑"}</button>
            </div>
            {session.error && <p role="alert" className="inline-error">{session.error}</p>}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {!tiled && <div
        className="resize-handle"
        role="separator"
        aria-label="调整列宽"
        aria-orientation="vertical"
        aria-valuenow={panelWidth}
        aria-valuemin={MIN_PANEL_WIDTH}
        title="左右拖动调整宽度，双击恢复默认宽度"
        tabIndex={0}
        onPointerDown={resize}
        onDoubleClick={() => setPanelWidth(fullscreen ? 660 : 440)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            setPanelWidth(Math.max(
                MIN_PANEL_WIDTH,
                panelWidth + (e.key === "ArrowRight" ? 20 : -20),
              ));
          }
        }}
      >
        <GripVertical size={12} />
      </div>}
    </motion.article>
  );
}
