import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
const executable = process.env.CODEX_BIN || "codex";
const child = spawn(executable, ["app-server", "--listen", "stdio://"], {
  stdio: ["pipe", "pipe", "pipe"],
});
let next = 1;
const pending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: Error) => void }
>();
const notices: any[] = [];
let tail = "";
child.stderr.on("data", (chunk) => {
  tail = (tail + chunk).slice(-2000);
});
const lines = createInterface({ input: child.stdout });
lines.on("line", (line) => {
  let e: any;
  try {
    e = JSON.parse(line);
  } catch {
    return;
  }
  if (e.method) {
    notices.push(e);
    if (e.id !== undefined)
      child.stdin.write(
        JSON.stringify({
          id: e.id,
          error: { code: -32601, message: "Smoke test does not execute tools" },
        }) + "\n",
      );
  } else {
    const task = pending.get(e.id);
    if (task) {
      pending.delete(e.id);
      if (e.error) task.reject(new Error(e.error.message));
      else task.resolve(e.result);
    }
  }
});
function rpc(method: string, params: unknown = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = next++;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
  });
}
const deadline = setTimeout(() => {
  console.error("App Server smoke test timed out");
  child.kill();
  process.exitCode = 1;
}, 90000);
child.on("error", (e) => {
  console.error(e.message);
  clearTimeout(deadline);
  process.exitCode = 1;
});
try {
  await rpc("initialize", {
    clientInfo: { name: "mosaic_smoke", version: "0.1.0" },
    capabilities: { experimentalApi: false },
  });
  child.stdin.write(
    JSON.stringify({ method: "initialized", params: {} }) + "\n",
  );
  const threads = await rpc("thread/list", {
    limit: 5,
    sortKey: "updated_at",
    sortDirection: "desc",
    modelProviders: [],
  });
  const models = await rpc("model/list", { limit: 100 });
  console.log(
    `PASS initialize, thread/list (${threads.data.length}), model/list (${models.data.length})`,
  );
  if (threads.data.length) {
    const r = await rpc("thread/turns/list", {
      threadId: threads.data[0].id,
      limit: 2,
      itemsView: "full",
      sortDirection: "desc",
    });
    console.log(`PASS history pagination (${r.data.length} turns)`);
  }
  if (process.argv.includes("--turns")) {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await rpc("thread/start", {
        ephemeral: true,
        cwd: process.cwd(),
        sandbox: "read-only",
        approvalPolicy: "on-request",
        approvalsReviewer: "user",
      });
      ids.push(r.thread.id);
    }
    await Promise.all(
      ids.map((id, i) =>
        rpc("turn/start", {
          threadId: id,
          input: [
            {
              type: "text",
              text: `Reply with exactly MOSAIC_SMOKE_${i}. Do not use tools or access files.`,
              text_elements: [],
            },
          ],
        }),
      ),
    );
    while (
      !ids.every((id) =>
        notices.some(
          (e) => e.method === "turn/completed" && e.params.threadId === id,
        ),
      )
    )
      await new Promise((r) => setTimeout(r, 100));
    for (const [i, id] of ids.entries()) {
      const completed = notices.find(
        (e) => e.method === "turn/completed" && e.params.threadId === id,
      );
      if (completed.params.turn.status !== "completed")
        throw new Error(
          `Turn ${i}: ${JSON.stringify(completed.params.turn.error)}`,
        );
      const deltas = notices
        .filter(
          (e) =>
            e.method === "item/agentMessage/delta" && e.params.threadId === id,
        )
        .map((e) => e.params.delta)
        .join("");
      if (!deltas.includes(`MOSAIC_SMOKE_${i}`))
        throw new Error(`Missing stream marker for thread ${i}`);
    }
    console.log(
      "PASS three concurrent ephemeral turns, isolated streaming and completion",
    );
  }
} catch (e) {
  console.error(String(e));
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  child.kill();
  lines.close();
}
