import type { ButtonHTMLAttributes, ReactNode } from "react";
import logoUrl from "../assets/dcm-logo.png";
import { Tooltip } from "@animate-ui/react/primitives/radix-ui/tooltip";
export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="icon-button"
          aria-label={label}
          {...props}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={8}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <img
      className={`logo ${small ? "small" : ""}`}
      src={logoUrl}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
