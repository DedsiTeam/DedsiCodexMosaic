import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { desktop, rpc } from "../lib/client";
import { patchPanel, type Panel } from "../lib/state";
import type { FuzzyFileSearchResponse } from "../protocol/FuzzyFileSearchResponse";
import type { SkillsListResponse } from "../protocol/v2/SkillsListResponse";

type Choice = { id: string; label: string; detail: string; text?: string; skill?: { name: string; path: string } };

export function useComposerSuggestions(panel: Panel, input: RefObject<HTMLTextAreaElement | null>, connected: boolean, attach: () => void) {
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const before = panel.draft.slice(0, caret);
  const match = before.match(/(?:^|\s)([@/])([^\s@]*)$/);
  const trigger = match?.[1];
  const query = match?.[2] ?? "";
  const start = caret - query.length - 1;
  const open = focused && !dismissed && !!trigger;
  const cwd = panel.executionCwd || panel.cwd;
  const listId = `composer-suggestions-${panel.id}`;

  useEffect(() => {
    setChoices([]);
    setSelected(0);
    if (!open) return;
    if (!desktop || !connected) { setStatus("连接桌面客户端后可使用文件搜索和技能。"); return; }
    if (!cwd) { setStatus("请先选择项目目录。"); return; }
    if (trigger === "@" && !query) { setStatus("输入文件或文件夹名称进行搜索。"); return; }
    let active = true;
    setStatus("正在加载…");
    const timer = window.setTimeout(async () => {
      const attachment: Choice[] = trigger === "/" && ["attach", "附件", "文件"].some((word) => word.includes(query.toLowerCase()))
        ? [{ id: "attach", label: "/attach · 添加附件", detail: "选择文件或图片" }] : [];
      try {
        let items: Choice[];
        if (trigger === "@") {
          const result = await rpc<FuzzyFileSearchResponse>("fuzzyFileSearch", { query, roots: [cwd], cancellationToken: null });
          items = result.files.slice(0, 40).map((file) => {
            const path = /^(?:[a-z]:[\\/]|\/|\\\\)/i.test(file.path) ? file.path : `${file.root.replace(/[\\/]$/, "")}/${file.path}`;
            return { id: path, label: file.file_name, detail: `${file.match_type === "directory" ? "文件夹" : "文件"} · ${file.path}`, text: JSON.stringify(path) };
          });
        } else {
          const result = await rpc<SkillsListResponse>("skills/list", { cwds: [cwd] });
          const seen = new Set<string>();
          items = [...attachment, ...result.data.flatMap((entry) => entry.skills).filter((skill) => {
            if (!skill.enabled || seen.has(skill.path)) return false;
            seen.add(skill.path);
            return `${skill.name} ${skill.description}`.toLowerCase().includes(query.toLowerCase());
          }).map((skill) => ({ id: skill.path, label: `/${skill.name}`, detail: skill.shortDescription || skill.description, text: `$${skill.name}`, skill: { name: skill.name, path: skill.path } }))];
        }
        if (active) { setChoices(items); setStatus(items.length ? "" : "没有匹配结果。"); }
      } catch (error) {
        if (active) { setChoices(attachment); setStatus(`加载失败：${String(error)}`); }
      }
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, trigger, query, cwd, connected]);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected, choices]);

  const choose = (choice: Choice) => {
    const inserted = choice.text ? `${choice.text} ` : "";
    const draft = panel.draft.slice(0, start) + inserted + panel.draft.slice(caret);
    patchPanel(panel.id, {
      draft,
      ...(choice.skill ? { draftSkills: [...(panel.draftSkills || []).filter((skill) => skill.name !== choice.skill!.name), choice.skill] } : {}),
    });
    setDismissed(true);
    if (choice.id === "attach") attach();
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(start + inserted.length, start + inserted.length);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || event.nativeEvent.isComposing) return false;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDismissed(true); return true; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((value) => choices.length ? (value + (event.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length : 0);
      return true;
    }
    if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
      event.preventDefault();
      if (choices[selected]) choose(choices[selected]);
      return true;
    }
    return false;
  };

  return {
    open, listId, activeId: choices[selected] ? `${listId}-${selected}` : undefined,
    onKeyDown,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onSelect: () => {
      const position = input.current?.selectionStart ?? 0;
      if (position !== caret) setDismissed(false);
      setCaret(position);
    },
    onChange: (element: HTMLTextAreaElement) => { setCaret(element.selectionStart); setDismissed(false); },
    menu: open ? <div className="composer-suggestions">
      <div className="composer-suggestions-heading">{trigger === "@" ? "引用项目文件" : "技能与快捷操作"}</div>
      {status && <p role="status">{status}</p>}
      <div ref={list} id={listId} role="listbox" aria-label={trigger === "@" ? "项目文件" : "技能与快捷操作"}>
        {choices.map((choice, index) => <div
          key={choice.id} id={`${listId}-${index}`} role="option" aria-selected={index === selected}
          className="composer-suggestion" onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setSelected(index)} onClick={() => choose(choice)}
        ><strong>{choice.label}</strong><span>{choice.detail}</span></div>)}
      </div>
    </div> : null,
  };
}
