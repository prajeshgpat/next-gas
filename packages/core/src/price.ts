import { LIVE_PRICE_MAX_AGE_H, STALE_PRICE_MAX_AGE_H } from "./constants.js";
import type { PriceConfidence, PriceQuote } from "./types.js";

const MS_PER_HOUR = 3_600_000;

const RANK: Record<PriceConfidence, number> = { low: 0, medium: 1, high: 2 };

export function priceConfidence(quote: PriceQuote, now: Date): PriceConfidence {
  if (quote.source === "estimate") return "low";
  const ageH = (now.getTime() - quote.observedAt.getTime()) / MS_PER_HOUR;
  if (ageH < LIVE_PRICE_MAX_AGE_H) return "high";
  if (ageH < STALE_PRICE_MAX_AGE_H) return "medium";
  return "low";
}

export function isAtLeast(confidence: PriceConfidence, floor: PriceConfidence): boolean {
  return RANK[confidence] >= RANK[floor];
}
