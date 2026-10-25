/** Reserve buffer: never plan to arrive with less than this. */
export const MIN_RESERVE_MI = 15;
export const RESERVE_FRACTION = 0.1;

/** v1 detour estimate: out and back, with a road-network factor over straight line. */
export const DETOUR_ROAD_FACTOR = 1.3;
export const DETOUR_SPEED_MPH = 30;

/** Prices younger than this are "high" confidence, younger than stale are "medium". */
export const LIVE_PRICE_MAX_AGE_H = 4;
export const STALE_PRICE_MAX_AGE_H = 24;

/** Only suggest waiting when it saves at least this much. */
export const MIN_SAVINGS_TO_WAIT_USD = 1;

/** Stretches without a station longer than this get a warning. */
export const GAP_WARN_MI = 40;
