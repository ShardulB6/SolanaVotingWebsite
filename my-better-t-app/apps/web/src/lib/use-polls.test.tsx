// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const rpc = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("./polls", () => ({
  programId: {},
  fetchPolls: rpc.read,
  fetchPoll: vi.fn(),
  fetchReceipt: vi.fn(),
  votingError: (error: Error) => error.message,
}));
import { usePolls } from "./use-polls";

describe("live on-chain results", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rpc.read.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("refreshes across a connection failure without erasing the last confirmed result", async () => {
    rpc.read
      .mockResolvedValueOnce([{ votes: [3, 2] }])
      .mockRejectedValueOnce(new Error("RPC unavailable"))
      .mockResolvedValueOnce([{ votes: [3, 7] }]);
    const hook = renderHook(usePolls);
    await act(async () => {});
    expect(hook.result.current.data).toEqual([{ votes: [3, 2] }]);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(hook.result.current.data).toEqual([{ votes: [3, 2] }]);
    expect(hook.result.current.error).toBe("RPC unavailable");
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(hook.result.current.data).toEqual([{ votes: [3, 7] }]);
    expect(hook.result.current.error).toBe("");
    hook.unmount();
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(rpc.read).toHaveBeenCalledTimes(3);
  });

  it("keeps the poll mounted while a transaction triggers a refresh", async () => {
    rpc.read.mockResolvedValueOnce([{ votes: [1, 0] }]);
    const hook = renderHook(usePolls);
    await act(async () => {});
    let resolve: (value: unknown) => void;
    rpc.read.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    act(() => hook.result.current.refresh());
    expect(hook.result.current.data).toEqual([{ votes: [1, 0] }]);
    await act(async () => {
      resolve!([{ votes: [2, 0] }]);
    });
    expect(hook.result.current.data).toEqual([{ votes: [2, 0] }]);
  });
});
