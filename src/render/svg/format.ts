export function formatCount(n: number): string {
  if (Math.abs(n) > 999) {
    return `${Number.parseFloat((n / 1000).toFixed(1))}k`;
  }
  return String(n);
}

export function formatPercent(n: number): string {
  return n.toFixed(2);
}

const XML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => XML_ENTITIES[char] ?? char);
}

export function truncate(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  return `${chars
    .slice(0, maxChars - 1)
    .join("")
    .trimEnd()}…`;
}
