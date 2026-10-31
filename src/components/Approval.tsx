import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { answer } from "../lib/state";
import type { WireEvent } from "../lib/client";
export function Approval({
  event,
  threadId,
}: {
  event: WireEvent;
  threadId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const p = event.params;
  const respond = async (value?: unknown) => {
    setBusy(true);
    await answer(threadId, event, value);
    setBusy(false);
  };
  const basic = [
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval",
  ].includes(event.method);
  const questions =
    event.method === "item/tool/requestUserInput" ? p.questions : null;
  return (
    <section className="approval" aria-label="等待确认">
      <div className="eyebrow">
        <ShieldCheck size={15} /> 需要你的确认
      </div>
      {basic ? (
        <>
          <h4>
            {event.method.includes("commandExecution")
              ? "允许执行此命令？"
              : "允许修改这些文件？"}
          </h4>
          <pre>{p.command || p.reason || "Codex 请求修改工作区文件。"}</pre>
          {p.command && p.reason && <p>{p.reason}</p>}
          <div className="button-row">
            <button
              disabled={busy}
              onClick={() => void respond({ decision: "decline" })}
            >
              拒绝
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void respond({ decision: "accept" })}
            >
              允许这一次
            </button>
          </div>
        </>
      ) : questions ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void respond({
              answers: Object.fromEntries(
                questions.map((q: any) => [q.id, { answers: [answers[q.id]] }]),
              ),
            });
          }}
        >
          {questions.map((q: any) => (
            <label className="question" key={q.id}>
              {q.question}
              {q.options?.map((o: any) => (
                <button
                  type="button"
                  className={answers[q.id] === o.label ? "selected" : ""}
                  key={o.label}
                  onClick={() => setAnswers({ ...answers, [q.id]: o.label })}
                >
                  {o.label}
                  <small>{o.description}</small>
                </button>
              ))}
              <input
                type={q.isSecret ? "password" : "text"}
                aria-label={q.question}
                placeholder="输入回答…"
                value={answers[q.id] || ""}
                onChange={(e) =>
                  setAnswers({ ...answers, [q.id]: e.target.value })
                }
              />
            </label>
          ))}
          <button
            className="primary"
            disabled={
              busy || questions.some((q: any) => !answers[q.id]?.trim())
            }
          >
            提交回答
          </button>
        </form>
      ) : event.method === "item/permissions/requestApproval" ? (
        <>
          <p>Codex 请求额外权限</p>
          <pre>{JSON.stringify(p.permissions, null, 2)}</pre>
          <div className="button-row">
            <button
              disabled={busy}
              onClick={() => void respond({ permissions: {}, scope: "turn" })}
            >
              拒绝
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void respond({
                  permissions: Object.fromEntries(
                    Object.entries(p.permissions || {}).filter(
                      ([, value]) => value != null,
                    ),
                  ),
                  scope: "turn",
                })
              }
            >
              允许本轮
            </button>
          </div>
        </>
      ) : (
        <>
          <p>当前版本暂不支持此交互：{event.method}</p>
          <button disabled={busy} onClick={() => void respond()}>
            拒绝并继续
          </button>
        </>
      )}
    </section>
  );
}
