import type { GetAccountRateLimitsResponse } from "../protocol/v2/GetAccountRateLimitsResponse";
import type { RateLimitWindow } from "../protocol/v2/RateLimitWindow";

export function usageBuckets(data: GetAccountRateLimitsResponse) {
  const buckets = Object.values(data.rateLimitsByLimitId ?? {}).filter(
    (value): value is NonNullable<typeof value> => !!value,
  );
  return buckets.length ? buckets : data.rateLimits ? [data.rateLimits] : [];
}

export function remainingPercent(window: RateLimitWindow): number | null {
  return Number.isFinite(window.usedPercent)
    ? Math.max(0, Math.min(100, 100 - window.usedPercent))
    : null;
}

export function windowLabel(window: RateLimitWindow, index: number) {
  const minutes = window.windowDurationMins;
  if (minutes === 10080) return "每周额度";
  if (minutes && minutes > 0) {
    if (minutes % 1440 === 0) return `${minutes / 1440} 天额度`;
    if (minutes % 60 === 0) return `${minutes / 60} 小时额度`;
    return `${minutes} 分钟额度`;
  }
  return index === 0 ? "主要额度" : "次要额度";
}
