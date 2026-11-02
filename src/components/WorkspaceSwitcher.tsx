import { useState } from "react";
import { Check, FolderOpen, Plus, Trash2 } from "lucide-react";
import { Popover } from "@animate-ui/react/primitives/radix-ui/popover";
import { open } from "@tauri-apps/plugin-dialog";
import { desktop } from "../lib/client";
import { removeWorkspace, sameWorkspace, setWorkspace, update, useStore } from "../lib/state";

const nameOf = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || path;

export function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const state = useStore();
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  async function addWorkspace() {
    setAdding(true);
    try {
      const path = await open({ directory: true, multiple: false, defaultPath: state.cwd || undefined, title: "添加工作区" });
      if (typeof path === "string") {
        setWorkspace(path);
        setExpanded(false);
      }
    } catch (error) {
      update({ error: String(error) });
    } finally {
      setAdding(false);
    }
  }
  return (
    <Popover.Root open={expanded} onOpenChange={setExpanded}>
      {collapsed ? (
        <Popover.Trigger className="icon-button" aria-label="切换或管理工作区" title="工作区列表">
          <FolderOpen size={18} />
        </Popover.Trigger>
      ) : (
        <div className="workspace-switch" title={state.cwd || "工作区列表"}>
          <div><strong>{state.cwd ? nameOf(state.cwd) : "本地工作区"}</strong></div>
          <Popover.Trigger className="icon-button" aria-label="切换或管理工作区" title="工作区列表">
            <FolderOpen size={18} />
          </Popover.Trigger>
        </div>
      )}
      <Popover.Portal>
        <Popover.Content className="workspace-popover" side="right" align="start" sideOffset={10} collisionPadding={12}>
          <div className="workspace-popover-heading">工作区</div>
          <div className="workspace-options">
            {state.workspaces.map((path) => (
              <div key={path} className={`workspace-option ${sameWorkspace(path, state.cwd) ? "current" : ""}`}>
                <button className="workspace-option-select" onClick={() => { setWorkspace(path); setExpanded(false); }} title={path} aria-pressed={sameWorkspace(path, state.cwd)}>
                  <FolderOpen size={16} />
                  <span><strong>{nameOf(path)}</strong><small>{path}</small></span>
                  {sameWorkspace(path, state.cwd) && <Check size={14} />}
                </button>
                <button className="icon-button" aria-label={`移除工作区 ${nameOf(path)}`} title="从列表移除，不删除项目文件" onClick={() => removeWorkspace(path)}><Trash2 size={14} /></button>
              </div>
            ))}
            {!state.workspaces.length && <p className="workspace-list-empty">还没有工作区，添加一个项目目录。</p>}
          </div>
          <button className="workspace-add" disabled={!desktop || adding} onClick={() => void addWorkspace()}><Plus size={16} />{adding ? "正在选择…" : "添加工作区"}</button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
