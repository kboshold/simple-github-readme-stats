import { describe, expect, it } from "vitest";
import {
  escapeXml,
  formatCount,
  formatPercent,
  truncate,
} from "../../src/render/svg/format.ts";

describe("formatCount", () => {
  it("keeps values up to 999 as integers", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(61)).toBe("61");
    expect(formatCount(999)).toBe("999");
  });

  it("formats values above 999 as one-decimal k", () => {
    expect(formatCount(1000)).toBe("1k");
    expect(formatCount(1234)).toBe("1.2k");
    expect(formatCount(4528)).toBe("4.5k");
    expect(formatCount(15_960)).toBe("16k");
  });
});

describe("formatPercent", () => {
  it("uses two decimals", () => {
    expect(formatPercent(54.9412)).toBe("54.94");
    expect(formatPercent(100)).toBe("100.00");
    expect(formatPercent(0.005)).toBe("0.01");
  });
});

describe("escapeXml", () => {
  it("escapes all five XML special characters", () => {
    expect(escapeXml(`a & b < c > d "e" 'f'`)).toBe(
      "a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39;",
    );
  });

  it("leaves plain text untouched", () => {
    expect(escapeXml("Kevin Boshold")).toBe("Kevin Boshold");
  });
});

describe("truncate", () => {
  it("returns short text unchanged", () => {
    expect(truncate("TypeScript", 10)).toBe("TypeScript");
  });

  it("cuts long text and appends an ellipsis within maxChars", () => {
    expect(truncate("Jupyter Notebook", 10)).toBe("Jupyter N…");
    expect(Array.from(truncate("Jupyter Notebook", 10))).toHaveLength(10);
  });
});
