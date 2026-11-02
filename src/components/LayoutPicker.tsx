import { useState } from "react";
import { PanelsTopLeft } from "lucide-react";
import { Popover } from "@animate-ui/react/primitives/radix-ui/popover";
import { LAYOUTS, type Layout } from "../lib/layouts";

export function LayoutPicker({ layout, available, onChange, onOpenChange }: {
  layout: Layout;
  available: Layout[];
  onChange: (layout: Layout) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const changeOpen = (value: boolean) => { setOpen(value); onOpenChange(value); };
  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Trigger className="fullscreen-button" aria-label="选择会话布局" title="会话布局">
        <PanelsTopLeft size={16} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="layout-popover" side="bottom" align="end" sideOffset={10} collisionPadding={12}>
          <div className="layout-heading">会话布局</div>
          <div className="layout-options">
            {LAYOUTS.map((item) => {
              const disabled = !available.includes(item.id);
              return <button key={item.id} className="layout-option" disabled={disabled}
                aria-pressed={layout === item.id}
                title={disabled ? "可用空间不足，请扩大窗口或进入全屏" : item.label}
                onClick={() => { onChange(item.id); changeOpen(false); }}>
                <span className={`layout-preview preview-${item.id}`} aria-hidden="true">
                  {Array.from({ length: item.slots || 3 }, (_, i) => <i key={i} />)}
                </span>
                <span>{item.label}</span>
              </button>;
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
