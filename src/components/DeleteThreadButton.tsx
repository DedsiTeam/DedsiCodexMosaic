import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Dialog } from "@animate-ui/react/primitives/radix-ui/dialog";
import { deleteThread, errorText, threadWorktree } from "../lib/state";
import { IconButton } from "./ui";

export function DeleteThreadButton({
  threadId,
  title,
  disabled,
}: {
  threadId: string;
  title: string;
  disabled: boolean;
}) {
  const worktree = threadWorktree(threadId);
  const [removeWorktree, setRemoveWorktree] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const remove = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await deleteThread(threadId, removeWorktree);
      setOpen(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <IconButton
        label={`永久删除会话：${title}`}
        disabled={disabled}
        onClick={() => {
          setError(undefined);
          setRemoveWorktree(false);
          setOpen(true);
        }}
      >
        <Trash2 size={14} />
      </IconButton>
      <Dialog.Root
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>永久删除会话？</Dialog.Title>
            <Dialog.Description>
              将物理删除“{title}
              ”及其派生子会话的历史文件、元数据和全部 ToDo 任务列表，无法恢复。
              {removeWorktree
                ? "同时删除此工作树目录及对应分支，原项目目录保留。"
                : "项目文件不会删除。"}
            </Dialog.Description>
            {worktree && (
              <label className="delete-worktree-option">
                <input
                  type="checkbox"
                  checked={removeWorktree}
                  disabled={busy}
                  onChange={(e) => setRemoveWorktree(e.target.checked)}
                />
                <span>
                  同时删除工作树和分支
                  <small>有未保存文件或未合并提交时会阻止删除。</small>
                </span>
              </label>
            )}
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
            <div className="button-row">
              <button disabled={busy} onClick={() => setOpen(false)}>
                取消
              </button>
              <button
                className="primary"
                disabled={busy || disabled}
                onClick={() => void remove()}
              >
                {busy ? "正在删除…" : "永久删除"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
