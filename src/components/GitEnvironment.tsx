import { useEffect, useState } from "react";
import {
  GitBranch,
  Settings,
  ChevronLeft,
  ChevronRight,
  Check,
  GitFork,
} from "lucide-react";
import { Popover } from "@animate-ui/react/primitives/radix-ui/popover";
import { Switch } from "@animate-ui/react/primitives/radix-ui/switch";
import { desktop, gitInfo, type GitInfo } from "../lib/client";
import { patchPanel, type Panel } from "../lib/state";

export function GitEnvironment({
  panel,
  disabled,
}: {
  panel: Panel;
  disabled: boolean;
}) {
  const [info, setInfo] = useState<GitInfo | null>(null);
  const [error, setError] = useState("");
  const [branchesOpen, setBranchesOpen] = useState(false);
  useEffect(() => {
    let current = true;
    setInfo(null);
    setError("");
    if (desktop && panel.cwd)
      void gitInfo(panel.executionCwd || panel.cwd)
        .then((result) => {
          if (current) setInfo(result);
        })
        .catch((e) => {
          if (current) setError(String(e));
        });
    return () => {
      current = false;
    };
  }, [panel.cwd, panel.executionCwd]);
  if (!info && !error) return null;
  const locked = disabled || !!panel.threadId || !!panel.executionCwd;
  const branch = panel.baseBranch || info?.branch || "HEAD";
  return (
    <Popover.Root onOpenChange={() => setBranchesOpen(false)}>
      <Popover.Trigger
        type="button"
        className={`environment-trigger ${panel.worktree ? "enabled" : ""}`}
        aria-label="配置本地环境"
        title="配置本地环境"
      >
        <Settings size={16} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="environment-popover"
          side="top"
          align="end"
          sideOffset={12}
          collisionPadding={12}
          aria-label="配置本地环境"
        >
          {branchesOpen ? (
            <>
              <button
                type="button"
                className="environment-back"
                onClick={() => setBranchesOpen(false)}
              >
                <ChevronLeft size={15} />
                选择基准分支
              </button>
              <div className="environment-branches">
                {["HEAD", ...(info?.branches || [])].map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="environment-option"
                    disabled={locked}
                    onClick={() => {
                      patchPanel(panel.id, { baseBranch: name });
                      setBranchesOpen(false);
                    }}
                  >
                    <GitBranch size={15} />
                    <span>{name === "HEAD" ? "HEAD（当前提交）" : name}</span>
                    {name === branch && <Check size={15} />}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="environment-heading">配置本地环境</div>
              {error ? (
                <p className="environment-note" role="alert">
                  {error}
                </p>
              ) : (
                <>
                  <div className="environment-option">
                    <GitFork size={17} />
                    <span>新建工作树</span>
                    <Switch.Root
                      className="environment-switch"
                      aria-label="新建工作树"
                      checked={!!panel.worktree}
                      disabled={locked || !info?.hasCommit}
                      onCheckedChange={(checked) =>
                        patchPanel(panel.id, {
                          worktree: checked,
                          baseBranch: branch,
                        })
                      }
                    >
                      <Switch.Thumb asChild>
                        <span className="environment-thumb" />
                      </Switch.Thumb>
                    </Switch.Root>
                  </div>
                  <button
                    type="button"
                    className="environment-option"
                    disabled={locked || !panel.worktree || !info?.hasCommit}
                    onClick={() => setBranchesOpen(true)}
                  >
                    <GitBranch size={17} />
                    <span>分支</span>
                    <span className="environment-value">
                      {panel.executionCwd ? info?.branch || "HEAD" : branch}
                    </span>
                    <ChevronRight size={15} />
                  </button>
                  {(!info?.hasCommit || panel.worktree) && (
                    <p className="environment-note">
                      {!info?.hasCommit
                        ? "仓库尚无提交，首次提交后可创建工作树。"
                        : panel.executionCwd
                          ? panel.executionCwd
                          : "首次发送时创建独立工作树。"}
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
