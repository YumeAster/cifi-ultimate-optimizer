export const MOD_RECOMMENDATION_COUNT_KEY = "cifi-ultimate.mod-tree.recommendation-count.v1";
export const DEFAULT_RECOMMENDATION_COUNT = 3;
export const RECOMMENDATION_COUNTS = Array.from({ length: 10 }, (_, index) => index + 1);

export function restoreRecommendationCount(value: unknown): number {
  const count = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof count === "number" && Number.isInteger(count) && count >= 1 && count <= 10
    ? count : DEFAULT_RECOMMENDATION_COUNT;
}
