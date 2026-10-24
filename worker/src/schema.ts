export type Grade = "regular" | "midgrade" | "premium" | "diesel";

/** One posted price at one station, as returned by the Worker. */
export interface PriceObservation {
  source: "gasbuddy";
  gasbuddyId: string;
  name: string;
  brand: string | null;
  lat: number;
  lon: number;
  grade: Grade;
  payment: "credit" | "cash";
  priceUsd: number;
  /** When the price was posted on GasBuddy (ISO 8601), if reported. */
  postedAt: string | null;
  /** When we fetched it (ISO 8601). */
  fetchedAt: string;
}
