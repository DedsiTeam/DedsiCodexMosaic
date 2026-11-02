import { describe, expect, it } from "vitest";
import { remainingPercent, usageBuckets, windowLabel } from "./usage";
import type { GetAccountRateLimitsResponse } from "../protocol/v2/GetAccountRateLimitsResponse";
import type { RateLimitSnapshot } from "../protocol/v2/RateLimitSnapshot";

describe("account usage", () => {
  it("converts used percentage to remaining and bounds server values", () => {
    const window = { usedPercent: 96, windowDurationMins: 10080, resetsAt: null };
    expect(remainingPercent(window)).toBe(4);
    expect(remainingPercent({ ...window, usedPercent: 110 })).toBe(0);
    expect(remainingPercent({ ...window, usedPercent: -2 })).toBe(100);
    expect(remainingPercent({ ...window, usedPercent: NaN })).toBeNull();
  });
  it("uses actual durations and does not assume missing windows are weekly", () => {
    const window = { usedPercent: 0, windowDurationMins: 10080, resetsAt: null };
    expect(windowLabel(window, 0)).toBe("每周额度");
    expect(windowLabel({ ...window, windowDurationMins: 300 }, 1)).toBe("5 小时额度");
    expect(windowLabel({ ...window, windowDurationMins: null }, 1)).toBe("次要额度");
  });
  it("prefers all metered buckets, with legacy fallback for an empty map", () => {
    const legacy = { limitId: "codex" } as RateLimitSnapshot;
    const other = { limitId: "other" } as RateLimitSnapshot;
    const data = { rateLimits: legacy, rateLimitsByLimitId: null } as GetAccountRateLimitsResponse;
    expect(usageBuckets(data)).toEqual([legacy]);
    expect(usageBuckets({ ...data, rateLimitsByLimitId: {} })).toEqual([legacy]);
    expect(usageBuckets({ ...data, rateLimitsByLimitId: { codex: legacy, other, missing: undefined } })).toEqual([legacy, other]);
  });
});
