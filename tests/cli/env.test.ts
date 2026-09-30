import { describe, expect, it } from "vitest";
import { requireToken } from "../../src/cli/env.ts";
import { StatsError } from "../../src/errors.ts";

describe("requireToken", () => {
  it("returns the trimmed token when set", () => {
    expect(requireToken({ GH_TOKEN: "  secret-value \n" })).toBe(
      "secret-value",
    );
  });

  it.each([
    ["unset", {}],
    ["empty", { GH_TOKEN: "" }],
    ["blank", { GH_TOKEN: "   " }],
  ])("throws TOKEN_MISSING when %s", (_, env) => {
    expect(() => requireToken(env)).toThrow(
      expect.objectContaining({ code: "TOKEN_MISSING" }),
    );
    expect(() => requireToken(env)).toThrow(StatsError);
  });
});
