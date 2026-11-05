import { useSyncExternalStore } from "react";
import { getState, send, type Attachment } from "./state";

export type TodoTask = {
  id: string;
  text: string;
  attachments: Attachment[];
  status: "pending" | "running" | "done" | "failed" | "uncertain";
  turnId?: string;
  error?: string;
};
type Queue = { tasks: TodoTask[]; running: boolean; threadId?: string };
const storageKey = "mosaic.todos.v1";
let queues: Record<string, Queue> = {};
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
  for (const [key, value] of Object.entries(saved) as [string, Queue][]) {
    if (!Array.isArray(value.tasks)) continue;
    queues[key] = { ...value, running: false, tasks: value.tasks.map(task => task.status === "running"
      ? { ...task, status: "uncertain", error: "执行状态待确认，请查看对话记录后标记已执行或重试。" } : task) };
  }
} catch { /* A missing queue never affects ordinary chat. */ }
const empty: Queue = { tasks: [], running: false };
const listeners = new Set<() => void>();
const dispatching = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
// Ignore late send responses after a conversation has been permanently deleted.
const deletedQueueKeys = new Set<string>();
function keyFor(panelId: string) {
  const threadId = getState().panels.find(p => p.id === panelId)?.threadId;
  return threadId ? `thread:${threadId}` : `panel:${panelId}`;
}
export function getTodoQueue(panelId: string) { return queues[keyFor(panelId)] || empty; }
function commit(key: string, queue: Queue) {
  if (deletedQueueKeys.has(key)) return;
  queues = { ...queues, [key]: queue };
  try { localStorage.setItem(storageKey, JSON.stringify(queues)); } catch { /* Keep in-memory work. */ }
  listeners.forEach(fn => fn());
}
export function useTodoQueue(panelId: string) {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => getTodoQueue(panelId));
}
export function bindTodoThread(panelId: string, threadId: string) {
  const oldKey = `panel:${panelId}`;
  if (!queues[oldKey]) return;
  const queue = queues[oldKey];
  delete queues[oldKey];
  commit(`thread:${threadId}`, { ...queue, threadId });
}
export function editTodo(panelId: string, task: TodoTask) {
  const queue = getTodoQueue(panelId);
  const old = queue.tasks.find(t => t.id === task.id);
  if (old && old.status !== "pending") return;
  if (!task.text.trim() && !task.attachments.length) return;
  commit(keyFor(panelId), { ...queue, tasks: old ? queue.tasks.map(t => t.id === task.id ? task : t) : [...queue.tasks, task] });
}
export function changeTodo(panelId: string, id: string, action: "delete" | "up" | "down" | "retry" | "done") {
  const queue = getTodoQueue(panelId);
  const tasks = [...queue.tasks];
  const index = tasks.findIndex(t => t.id === id);
  if (index < 0 || tasks[index].status === "running") return;
  if (action === "delete") tasks.splice(index, 1);
  else if (action === "retry" || action === "done") tasks[index] = { ...tasks[index], status: action === "retry" ? "pending" : "done", turnId: undefined, error: undefined };
  else {
    const next = index + (action === "up" ? -1 : 1);
    if (!tasks[next] || tasks[next].status === "running") return;
    [tasks[index], tasks[next]] = [tasks[next], tasks[index]];
  }
  commit(keyFor(panelId), { ...queue, running: false, tasks });
}
export function pauseTodos(panelId: string) {
  const queue = getTodoQueue(panelId);
  if (queue.running) commit(keyFor(panelId), { ...queue, running: false });
  clearTimeout(timers.get(panelId));
  timers.delete(panelId);
}
export function pauseThreadTodos(threadId: string) {
  for (const panel of getState().panels) if (panel.threadId === threadId) pauseTodos(panel.id);
}
export function disconnectTodos() {
  for (const [key, queue] of Object.entries(queues)) commit(key, { ...queue, running: false, tasks: queue.tasks.map(task => task.status === "running" ? { ...task, status: "uncertain", error: "连接断开，执行结果待确认。请查看对话后处理。" } : task) });
}
export function deleteThreadTodos(threadId: string) {
  const keys = new Set([`thread:${threadId}`]);
  for (const panel of getState().panels) {
    if (panel.threadId !== threadId) continue;
    keys.add(`panel:${panel.id}`);
    clearTimeout(timers.get(panel.id));
    timers.delete(panel.id);
  }
  for (const [key, queue] of Object.entries(queues)) {
    if (queue.threadId === threadId) keys.add(key);
  }
  queues = { ...queues };
  for (const key of keys) {
    deletedQueueKeys.add(key);
    delete queues[key];
  }
  try { localStorage.setItem(storageKey, JSON.stringify(queues)); } catch { /* Optional storage. */ }
  listeners.forEach(fn => fn());
}
function schedule(panelId: string) {
  clearTimeout(timers.get(panelId));
  timers.set(panelId, setTimeout(() => { timers.delete(panelId); void dispatch(panelId); }, 800));
}
export function startTodos(panelId: string) {
  const queue = getTodoQueue(panelId);
  if (queue.tasks.some(t => ["running", "uncertain", "failed"].includes(t.status))) return;
  commit(keyFor(panelId), { ...queue, running: true });
  void dispatch(panelId);
}
async function dispatch(panelId: string) {
  const queue = getTodoQueue(panelId);
  if (!queue.running || dispatching.has(panelId)) return;
  const state = getState();
  const panel = state.panels.find(p => p.id === panelId);
  const session = panel?.threadId ? state.sessions[panel.threadId] : undefined;
  if (!panel || !panel.cwd || state.connection !== "connected" || (panel.threadId && (!session?.writable || session.busy || session.loading || session.editing || session.approvals.length))) {
    pauseTodos(panelId);
    return;
  }
  const task = queue.tasks.find(t => t.status === "pending");
  if (!task || queue.tasks.some(t => ["running", "uncertain", "failed"].includes(t.status))) { pauseTodos(panelId); return; }
  dispatching.add(panelId);
  commit(keyFor(panelId), { ...queue, tasks: queue.tasks.map(t => t.id === task.id ? { ...t, status: "running", error: undefined, turnId: undefined } : t) });
  try {
    const result = await send(panelId, { text: task.text, attachments: task.attachments });
    const current = getTodoQueue(panelId);
    const active = current.tasks.find(t => t.id === task.id);
    if (active?.status === "running") {
      if (!result) throw new Error("任务未发送，请确认连接与会话状态。");
      commit(keyFor(panelId), { ...current, tasks: current.tasks.map(t => t.id === task.id ? { ...t, turnId: result.turnId } : t) });
    }
  } catch (error) {
    const current = getTodoQueue(panelId);
    commit(keyFor(panelId), { ...current, running: false, tasks: current.tasks.map(t => t.id === task.id && t.status === "running" ? { ...t, status: "uncertain", error: `${String(error)} 请查看对话记录，确认是否执行后再重试。` } : t) });
  } finally {
    dispatching.delete(panelId);
    if (getTodoQueue(panelId).running && !getTodoQueue(panelId).tasks.some(t => t.status === "running")) schedule(panelId);
  }
}
export function todoTurnEvent(threadId: string, turn: { id: string; status?: string; error?: { message: string } | null }, completed: boolean) {
  const key = `thread:${threadId}`;
  const queue = queues[key];
  if (!queue) return;
  const panel = getState().panels.find(p => p.threadId === threadId);
  const task = queue.tasks.find(t => (t.status === "running" || t.status === "uncertain") && (t.turnId === turn.id || (!t.turnId && panel && dispatching.has(panel.id))));
  if (!task) return;
  const success = turn.status === "completed" && !turn.error;
  commit(key, { ...queue, running: completed && !success ? false : queue.running, tasks: queue.tasks.map(t => t.id === task.id ? { ...t, turnId: turn.id, status: completed ? success ? "done" : "failed" : t.status, error: completed ? success ? undefined : turn.error?.message || "执行已中断，可重试。" : t.error } : t) });
  if (completed && success && panel && queue.running && !dispatching.has(panel.id)) schedule(panel.id);
}
