import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
export const desktop = isTauri();
export const openLink = (href: string, cwd: string) =>
  invoke<void>("open_link", { href, cwd });
export type WireEvent = {
  method: string;
  id?: string | number;
  params: Record<string, any>;
};
export const rpc = <T>(method: string, params: unknown = {}): Promise<T> =>
  invoke("rpc", { method, params });
export const connect = () =>
  invoke<{ executable: string }>("connect");
export const respond = (id: string | number, result: unknown) =>
  invoke("respond", { id, result, error: null });
export const rejectUnsupported = (id: string | number) =>
  invoke("respond", {
    id,
    result: null,
    error: {
      code: -32601,
      message: "This request is not supported by DedsiCodexMosaic yet.",
    },
  });
export const onEvent = (callback: (event: WireEvent) => void) =>
  listen<WireEvent>("codex:event", (e) => callback(e.payload));

export type GitInfo = {
  root: string;
  branch: string;
  branches: string[];
  hasCommit: boolean;
};
export const gitInfo = (cwd: string) =>
  invoke<GitInfo | null>("git_info", { cwd });
export const createWorktree = (cwd: string, base: string, id: string) =>
  invoke<{ path: string; branch: string }>("create_worktree", {
    cwd,
    base,
    id,
  });

export const deleteThreadWithWorktree = (
  threadId: string,
  cwd: string,
  path: string,
) => invoke<void>("delete_thread_with_worktree", { threadId, cwd, path });

export const saveAttachment = (id: string, name: string, bytes: number[]) =>
  invoke<string>("save_attachment", { id, name, bytes });
export const readAttachment = (path: string) =>
  invoke<number[]>("read_attachment", { path });
