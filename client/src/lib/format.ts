// Format a number with sign prefix
export function formatChange(value: number): string {
  if (value > 0) return `+${value.toFixed(2)}`;
  return value.toFixed(2);
}

export function formatPercent(value: number): string {
  if (value > 0) return `+${value.toFixed(2)}%`;
  return `${value.toFixed(2)}%`;
}

// Format large numbers (亿)
export function formatAmount(value: number): string {
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(2)}万亿`;
  if (Math.abs(value) >= 1) return `${value.toFixed(2)}亿`;
  return `${(value * 10000).toFixed(0)}万`;
}

// Format volume (手)
export function formatVolume(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(2)}万手`;
  return `${value}手`;
}

// Get color class based on value
export function getChangeColor(value: number): string {
  if (value > 0) return "text-stock-up";
  if (value < 0) return "text-stock-down";
  return "text-stock-flat";
}

// Get score color
export function getScoreColor(score: number): string {
  if (score >= 70) return "score-high";
  if (score >= 40) return "score-mid";
  return "score-low";
}

// Market code to full code
export function getFullCode(code: string, market: "SH" | "SZ"): string {
  return `${market === "SH" ? "sh" : "sz"}${code}`;
}
