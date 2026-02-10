export type FreshnessBucket = "green" | "yellow" | "red";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function getFreshnessBucket(freshUntilIso: string | null | undefined, now: Date = new Date()): FreshnessBucket {
  if (!freshUntilIso) return "red";
  const freshMs = Date.parse(freshUntilIso);
  if (!Number.isFinite(freshMs)) return "red";

  const ageMs = now.getTime() - freshMs;
  if (ageMs <= 24 * HOUR_MS) return "green";
  if (ageMs <= 7 * DAY_MS) return "yellow";
  return "red";
}

export function getRecommendedRangeAction(bucket: FreshnessBucket): { mode: "last24h" | "last7d" | null; label: string } {
  switch (bucket) {
    case "red":
      return { mode: "last7d", label: "Correr 7d" };
    case "yellow":
      return { mode: "last24h", label: "Correr 24h" };
    case "green":
      return { mode: null, label: "No hace falta" };
  }
}

