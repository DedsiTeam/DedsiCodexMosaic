import { useState } from "react";
import { Check, Hand, ShieldCheck, ShieldAlert } from "lucide-react";
import { Popover } from "@animate-ui/react/primitives/radix-ui/popover";
import { patchPanel, type Panel } from "../lib/state";

const modes = [
  { value: "ask", label: "请求批准", short: "请求批准", Icon: Hand, description: "访问工作区外文件或联网需要提权时，由你批准。" },
  { value: "auto", label: "帮我批准", short: "帮我批准", Icon: ShieldCheck, description: "由自动审核判断操作风险并处理批准请求。" },
  { value: "full", label: "完全访问权限", short: "完全访问", Icon: ShieldAlert, description: "允许访问互联网及本机文件，不再请求批准。" },
] as const;

export function PermissionSelector({ panel, disabled }: { panel: Panel; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const selected = modes.find((mode) => mode.value === panel.permissionMode) || modes[0];
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="permission-trigger" disabled={disabled} aria-label={`权限：${selected.label}`}>
        <selected.Icon size={14} /><span>{selected.short}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="permission-popover" side="top" align="start" sideOffset={8} collisionPadding={12}>
          <div className="permission-heading">如何批准操作？</div>
          <div role="radiogroup" aria-label="会话权限">
            {modes.map(({ value, label, Icon, description }) => (
              <button key={value} type="button" role="radio" aria-checked={selected.value === value} disabled={disabled} className="permission-option" onClick={() => {
                patchPanel(panel.id, { permissionMode: value });
                setOpen(false);
              }}>
                <Icon size={17} />
                <span><strong>{label}</strong><small>{description}</small></span>
                {selected.value === value && <Check size={15} />}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
