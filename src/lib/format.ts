/**
 * Compact vote counts: 999 → `999`, 1500 → `2K`, 1234567 → `1.2M`.
 * Null for missing or invalid input.
 */
export function formatCompactCount(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  if (value >= 1_000_000) {
    const rounded = Math.round(value / 100_000) / 10;
    return `${rounded}M`;
  }
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return `${Math.floor(value)}`;
}
