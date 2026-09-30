import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli, StatsError } from "../src/errors.ts";

class ExitCalled extends Error {}

function spyOnProcess() {
  const exit = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new ExitCalled();
  });
  const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  return { exit, stderr };
}

describe("runCli", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps a StatsError to the stderr line and exit code 1", async () => {
    const { exit, stderr } = spyOnProcess();

    await expect(
      runCli(async () => {
        throw new StatsError("TOKEN_MISSING", "GH_TOKEN is not set");
      }),
    ).rejects.toBeInstanceOf(ExitCalled);

    expect(stderr.mock.calls).toEqual([
      ["error[TOKEN_MISSING]: GH_TOKEN is not set\n"],
    ]);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("keeps the output on one line", async () => {
    const { stderr } = spyOnProcess();

    await expect(
      runCli(async () => {
        throw new StatsError(
          "CONFIG_INVALID",
          "username: required\n  gist.id: required",
        );
      }),
    ).rejects.toBeInstanceOf(ExitCalled);

    expect(stderr.mock.calls).toEqual([
      ["error[CONFIG_INVALID]: username: required gist.id: required\n"],
    ]);
  });

  it("reports unknown errors as INTERNAL and exits 1", async () => {
    const { exit, stderr } = spyOnProcess();

    await expect(
      runCli(async () => {
        throw new Error("boom");
      }),
    ).rejects.toBeInstanceOf(ExitCalled);

    expect(stderr.mock.calls).toEqual([["error[INTERNAL]: boom\n"]]);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("does not exit when main resolves", async () => {
    const { exit, stderr } = spyOnProcess();

    await runCli(async () => {});

    expect(exit).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });
});
