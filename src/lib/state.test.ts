import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./client", () => ({
  desktop: false,
  connect: vi.fn(),
  onEvent: vi.fn(),
  rejectUnsupported: vi.fn(),
  respond: vi.fn(),
  rpc: vi.fn(),
}));
import {
  applyEvent,
  emptySession,
  getState,
  mergeHistory,
  loadThread,
  send,
  reorderPanels,
  update,
  type Message,
} from "./state";
import { rpc } from "./client";
beforeEach(() => {
  vi.mocked(rpc).mockReset();
  update({ sessions: {}, threads: [], panels: [], cwd: "", connection: "connected" });
});
describe("concurrent Codex event routing", () => {
  it("isolates interleaved message streams and turn completion", () => {
    for (const id of ["a", "b", "c"])
      applyEvent({
        method: "turn/started",
        params: { threadId: id, turn: { id: `turn-${id}` } },
      });
    for (const [id, text] of [
      ["a", "hello"],
      ["b", "bonjour"],
      ["a", " world"],
      ["c", "你好"],
    ])
      applyEvent({
        method: "item/agentMessage/delta",
        params: {
          threadId: id,
          turnId: `turn-${id}`,
          itemId: "same-item-id",
          delta: text,
        },
      });
    applyEvent({
      method: "turn/completed",
      params: { threadId: "b", turn: { error: null } },
    });
    expect(getState().sessions.a.items[0].text).toBe("hello world");
    expect(getState().sessions.b.items[0].text).toBe("bonjour");
    expect(getState().sessions.c.items[0].text).toBe("你好");
    expect(getState().sessions.a.busy).toBe(true);
    expect(getState().sessions.b.busy).toBe(false);
  });
  it("routes and resolves approvals by request and thread", () => {
    for (const id of ["a", "b"])
      applyEvent({
        method: "item/commandExecution/requestApproval",
        id,
        params: { threadId: id, command: "test" },
      });
    applyEvent({
      method: "serverRequest/resolved",
      params: { threadId: "a", requestId: "a" },
    });
    expect(getState().sessions.a.approvals).toHaveLength(0);
    expect(getState().sessions.b.approvals).toHaveLength(1);
  });
  it("invalidates stale approval requests and busy state on disconnection", () => {
    update({
      sessions: {
        a: {
          ...emptySession(),
          busy: true,
          activeTurn: "x",
          loaded: true,
          approvals: [{ id: 4, method: "approval", params: {} }],
        },
      },
    });
    applyEvent({ method: "mosaic/disconnected", params: {} });
    expect(getState().connection).toBe("disconnected");
    expect(getState().sessions.a).toMatchObject({
      busy: false,
      loaded: false,
      approvals: [],
    });
  });
});
describe("history/live stream reconciliation", () => {
  const old: Message = {
    id: "1",
    turnId: "t",
    kind: "agentMessage",
    text: "partial",
  };
  it("uses fresh history after reconnect instead of a stale cached partial message", () => {
    expect(
      mergeHistory([{ ...old, text: "complete" }], [old], [old])[0].text,
    ).toBe("complete");
  });
  it("keeps live deltas that arrived while a history request was in flight", () => {
    expect(
      mergeHistory([old], [{ ...old, text: "partial and live" }], [old])[0]
        .text,
    ).toBe("partial and live");
  });
  it("prepends older history and deduplicates overlap", () => {
    const older = { ...old, id: "0" };
    const newer = { ...old, id: "2" };
    expect(mergeHistory([older, old], [old, newer]).map((m) => m.id)).toEqual([
      "0",
      "1",
      "2",
    ]);
  });
});

describe("existing writer ownership", () => {
  it("loads history read-only when another client owns the thread and blocks sending", async () => {
    update({
      cwd: "/tmp",
      panels: [
        {
          id: "panel",
          threadId: "a",
          title: "test",
          cwd: "/tmp",
          width: 440,
          draft: "do not send",
          model: "",
        },
      ],
    });
    vi.mocked(rpc).mockRejectedValueOnce(
      new Error("thread a already has an active writer"),
    );
    vi.mocked(rpc).mockResolvedValueOnce({
      data: [
        {
          id: "t",
          status: "completed",
          items: [{ type: "agentMessage", id: "m", text: "Existing history" }],
        },
      ],
      nextCursor: null,
    });
    await loadThread("a");
    expect(getState().sessions.a).toMatchObject({
      loaded: true,
      writable: false,
      busy: false,
    });
    expect(getState().sessions.a.items[0].text).toBe("Existing history");
    await send("panel");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe("saved panel ordering", () => {
  it("persists workspace order while retaining active drafts and running sessions", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });
    try {
      const panel = (id: string, cwd: string) => ({ id, cwd, title: id, width: 440, draft: "draft-" + id, model: "" });
      const panels = [panel("a", "/project"), panel("other", "/other"), panel("b", "/project")];
      const sessions = { task: { ...emptySession(), busy: true } };
      update({ cwd: "/project", panels, active: "a", sessions });
      reorderPanels(["b", "a"]);
      expect(getState().panels.map((p) => p.id)).toEqual(["b", "other", "a"]);
      expect(getState().panels[2]).toBe(panels[0]);
      expect(getState().active).toBe("a");
      expect(getState().sessions).toBe(sessions);
      const saved = JSON.parse(setItem.mock.calls[0][1]);
      expect(saved.panels.map((p: { id: string }) => p.id)).toEqual(["b", "other", "a"]);
      reorderPanels(["a"]);
      expect(setItem).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
