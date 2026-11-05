import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ListTodo, Paperclip, X, Plus, Play, Pause, Check, ImagePlus, ListChecks, ChevronDown } from "lucide-react";
import { Dialog } from "@animate-ui/react/primitives/radix-ui/dialog";
import { desktop, saveAttachment } from "../lib/client";
import { useStore, type Panel } from "../lib/state";
import { changeTodo, editTodo, pauseTodos, startTodos, useTodoQueue, type TodoTask } from "../lib/todos";
import { AttachmentView } from "./Attachments";

const labels = { pending: "待执行", running: "执行中", done: "已执行", failed: "未完成", uncertain: "待确认" };
export function TodoList({ panel }: { panel: Panel }) {
  const queue = useTodoQueue(panel.id);
  const state = useStore();
  const session = panel.threadId ? state.sessions[panel.threadId] : undefined;
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<TodoTask | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const uploadLock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const pending = queue.tasks.filter(t => t.status === "pending").length;
  const done = queue.tasks.filter(t => t.status === "done").length;
  const attention = queue.tasks.filter(t => t.status === "failed" || t.status === "uncertain").length;
  const active = queue.tasks.find(t => t.status === "running");
  const blocked = queue.tasks.some(t => ["running", "failed", "uncertain"].includes(t.status));
  const canStart = !!panel.cwd && state.connection === "connected" && (!panel.threadId || (session?.writable && !session.busy && !session.loading && !session.editing && !session.approvals.length));
  function edit(task?: TodoTask) {
    pauseTodos(panel.id);
    setError("");
    setDraft(task ? { ...task, attachments: [...task.attachments] } : { id: crypto.randomUUID(), text: "", attachments: [], status: "pending" });
  }
  async function addFiles(files: File[]) {
    if (!draft || uploadLock.current || !desktop) return;
    uploadLock.current = true;
    setUploading(true);
    setError("");
    let count = draft.attachments.length;
    const draftId = draft.id;
    try {
      for (const file of files) {
        if (count >= 10) throw new Error("每个任务最多 10 张图片。");
        if (file.size > 25 * 1024 * 1024) throw new Error("单张图片不能超过 25 MB。");
        const name = file.name || `截图-${Date.now()}.png`;
        const mime = file.type || ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" } as Record<string, string>)[name.split(".").pop()?.toLowerCase() || ""];
        if (!/^image\/(png|jpeg|webp|gif)$/.test(mime || "")) throw new Error("请选择 PNG、JPEG、WebP 或 GIF 图片。");
        const id = crypto.randomUUID();
        const path = await saveAttachment(id, name, Array.from(new Uint8Array(await file.arrayBuffer())));
        setDraft(current => current?.id === draftId ? { ...current, attachments: [...current.attachments, { id, name, path, mime, size: file.size }] } : current);
        count++;
      }
    } catch (e) { setError(String(e)); }
    finally { uploadLock.current = false; setUploading(false); }
  }
  return <Dialog.Root open={open} onOpenChange={value => { setOpen(value); if (value) setExpanded({}); }}>
    <Dialog.Trigger asChild>
      <button type="button" className={`icon-button todo-button${active || queue.running ? " is-running" : ""}`} aria-label={`ToDo 任务列表，${pending} 项待执行`} title={`ToDo · ${pending} 待执行`} onPointerDown={e => e.stopPropagation()}>
        <ListTodo size={16} />
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" onPointerDown={e => e.stopPropagation()} />
      <Dialog.Content className="dialog-content todo-dialog" onPointerDown={e => e.stopPropagation()}>
        <div className="todo-dialog-heading">
          <div className="todo-title-group"><span className="todo-title-icon"><ListChecks size={24} /></span><div><Dialog.Title>ToDo 任务列表</Dialog.Title></div></div>
          <Dialog.Close className="icon-button" aria-label="关闭任务列表"><X size={16} /></Dialog.Close>
        </div>
        <Dialog.Description hidden>{panel.title}的任务列表</Dialog.Description>
        <div className="todo-body">
      <div className="todo-overview">
        <div className="todo-progress-heading"><span className="todo-status-pill">{active ? "正在执行" : queue.running ? "自动执行中" : attention ? "需要处理" : queue.tasks.length && done === queue.tasks.length ? "全部已执行" : "等待开始"}</span><span>{done} / {queue.tasks.length} 已执行</span></div>
        <div className="todo-progress" role="progressbar" aria-label="任务执行进度" aria-valuemin={0} aria-valuemax={queue.tasks.length || 1} aria-valuenow={done}><span style={{ width: `${queue.tasks.length ? done / queue.tasks.length * 100 : 0}%` }} /></div>
        <div className="todo-stats"><div><strong>{pending}</strong><span>待执行</span></div><div><strong>{active ? 1 : 0}</strong><span>执行中</span></div><div><strong>{done}</strong><span>已执行</span></div><div><strong>{attention}</strong><span>待处理</span></div></div>
      </div>
      <div className="todo-toolbar"><div><h3>任务清单 <span>{queue.tasks.length}</span></h3></div><div className="todo-actions">
        <button type="button" disabled={!!draft} onClick={() => edit()}><Plus size={14} />添加任务</button>
        {queue.running ? <button type="button" className="todo-primary" onClick={() => pauseTodos(panel.id)}><Pause size={14} />暂停队列</button>
          : <button type="button" className="todo-primary" disabled={!pending || blocked || !canStart || !!draft} onClick={() => startTodos(panel.id)}><Play size={14} />开始执行</button>}
      </div></div>
      {!queue.tasks.length && !draft && <div className="todo-empty"><span><ListTodo size={28} /></span><h3>暂无任务</h3><button type="button" onClick={() => edit()}><Plus size={15} />创建第一个任务</button></div>}
      <ol className="todo-items">
        {queue.tasks.map((task, index) => <li key={task.id} className={`todo-item todo-item-${task.status}`}>
          <div className="todo-item-heading"><div className="todo-task-label"><span className="todo-task-number">{task.status === "done" ? <Check size={14} /> : String(index + 1).padStart(2, "0")}</span><strong>{labels[task.status]}</strong>{!!task.attachments.length && <small><Paperclip size={11} />{task.attachments.length}</small>}</div>
            <div className="todo-actions">
              <button type="button" className="todo-expand" aria-label={`${expanded[task.id] ? "折叠" : "展开"}任务 ${index + 1}`} aria-expanded={!!expanded[task.id]} aria-controls={`todo-detail-${panel.id}-${task.id}`} onClick={() => setExpanded(current => ({ ...current, [task.id]: !current[task.id] }))}><ChevronDown size={14} /></button>
              {task.status === "pending" && <>
                <button type="button" disabled={!!draft} onClick={() => edit(task)}>编辑</button>
                <button type="button" aria-label="任务上移" disabled={!!draft || index === 0} onClick={() => changeTodo(panel.id, task.id, "up")}><ArrowUp size={12} /></button>
                <button type="button" aria-label="任务下移" disabled={!!draft || index === queue.tasks.length - 1} onClick={() => changeTodo(panel.id, task.id, "down")}><ArrowDown size={12} /></button>
              </>}
              {task.status !== "running" && <button type="button" aria-label="删除任务" disabled={!!draft} onClick={() => changeTodo(panel.id, task.id, "delete")}><X size={12} /></button>}
            </div>
          </div>
          <div id={`todo-detail-${panel.id}-${task.id}`} hidden={!expanded[task.id]}>
          {task.text && <p className="todo-text">{task.text}</p>}
          {!!task.attachments.length && <div className="attachment-list">{task.attachments.map(file => <AttachmentView key={file.id} file={file} />)}</div>}
          </div>
          {task.error && <p className="todo-hint" role="status">{task.error}</p>}
          {(task.status === "failed" || task.status === "uncertain") && <div className="todo-actions">
            <button type="button" disabled={!!draft} onClick={() => changeTodo(panel.id, task.id, "retry")}>确认重新执行</button>
            <button type="button" disabled={!!draft} onClick={() => changeTodo(panel.id, task.id, "done")}>标记已执行</button>
          </div>}
        </li>)}
      </ol>
      {draft && <div className="todo-editor">
        <div className="todo-editor-heading"><span><Plus size={16} />{queue.tasks.some(t => t.id === draft.id) ? "编辑任务" : "新任务"}</span></div>
        <textarea autoFocus aria-label="ToDo 任务内容" placeholder="输入任务…" value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} onPaste={e => {
          const files = Array.from(e.clipboardData.files);
          if (files.length) { e.preventDefault(); void addFiles(files); }
        }} />
        <div className="attachment-list">{draft.attachments.map(file => <AttachmentView key={file.id} file={file} onRemove={uploading ? undefined : () => setDraft({ ...draft, attachments: draft.attachments.filter(f => f.id !== file.id) })} />)}</div>
        <button type="button" className="todo-upload" disabled={!desktop || uploading} onClick={() => input.current?.click()} onDragOver={e => { e.preventDefault(); }} onDrop={e => { e.preventDefault(); void addFiles(Array.from(e.dataTransfer.files)); }}><ImagePlus size={22} /><span><strong>{uploading ? "正在保存图片…" : "点击添加或拖入参考图片"}</strong></span></button>
        <input hidden ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ""; void addFiles(files); }} />
        {error && <p role="alert" className="todo-hint">{error}</p>}
        <div className="todo-actions todo-editor-footer">
          
          <button type="button" disabled={uploading} onClick={() => setDraft(null)}>取消</button>
          <button type="button" className="todo-primary" disabled={uploading || (!draft.text.trim() && !draft.attachments.length)} onClick={() => { editTodo(panel.id, draft); setDraft(null); }}><Check size={14} />保存任务</button>
        </div>
      </div>}
        </div>
        
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
