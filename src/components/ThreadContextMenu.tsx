import { useRef, useState, type ReactElement } from "react";
import { ContextMenu } from "radix-ui";
import { Dialog } from "@animate-ui/react/primitives/radix-ui/dialog";
import { Pencil } from "lucide-react";
import { errorText, renameConversation, useStore } from "../lib/state";

export function ThreadContextMenu({ children, title, threadId, panelId }: {
  children: ReactElement;
  title: string;
  threadId?: string;
  panelId?: string;
}) {
  const state = useStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const disabled = !!threadId && state.connection !== "connected";
  return <>
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="thread-context-menu" collisionPadding={8} onCloseAutoFocus={(event) => {
          if (open) event.preventDefault();
        }}>
          <ContextMenu.Item className="thread-context-item" disabled={disabled} onSelect={() => {
            setName(title);
            setError("");
            setOpen(true);
          }}><Pencil size={14} />重命名</ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
    <Dialog.Root open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content rename-dialog" aria-describedby={undefined} onPointerDown={(event) => event.stopPropagation()} onOpenAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus();
          input.current?.select();
        }}>
          <Dialog.Title>重命名对话</Dialog.Title>
          <form onSubmit={async (event) => {
            event.preventDefault();
            if (busy || disabled || !name.trim()) return;
            setBusy(true);
            setError("");
            try {
              await renameConversation(name, threadId, panelId);
              setOpen(false);
            } catch (error) { setError(errorText(error)); }
            finally { setBusy(false); }
          }}>
            <input ref={input} aria-label="对话名称" value={name} disabled={busy} onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }} />
            {error && <p role="alert" className="inline-error">{error}</p>}
            <div className="button-row">
              <button type="button" disabled={busy} onClick={() => setOpen(false)}>取消</button>
              <button type="submit" className="primary" disabled={busy || disabled || !name.trim()}>{busy ? "正在保存…" : "保存"}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}
