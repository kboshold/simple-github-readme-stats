export function formatCount(n: number): string {
  if (Math.abs(n) > 999) {
    return `${Math.sign(n) * Number.parseFloat((Math.abs(n) / 1000).toFixed(1))}k`;
  }
  return String(Math.sign(n) * Math.abs(n));
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
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  return `${chars
    .slice(0, Math.max(0, maxChars - 1))
    .join("")
    .trimEnd()}…`;
}
