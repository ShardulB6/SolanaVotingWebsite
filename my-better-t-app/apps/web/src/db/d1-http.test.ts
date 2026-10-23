import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { remoteD1Database } from "./database.server";
import { polls } from "./schema";
const credentials = { accountId: "account", databaseId: "database", token: "server-only-token" };
afterEach(() => vi.unstubAllGlobals());
describe("D1 HTTP access for tunnel development", () => {
  it("sends parameterized Drizzle queries with server-side credentials and maps raw rows", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: [{ success: true, results: { rows: [["poll-id"]] } }],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const rows = await remoteD1Database(credentials).select({ id: polls.id }).from(polls);
    expect(rows).toEqual([{ id: "poll-id" }]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account/d1/database/database/raw",
      expect.objectContaining({
        headers: { Authorization: "Bearer server-only-token", "Content-Type": "application/json" },
        body: expect.stringContaining('"params":[]'),
      }),
    );
  });
  it("redacts Cloudflare error response bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ success: false, errors: [{ message: "private SQL and token" }] }),
            { status: 403 },
          ),
        ),
    );
    await expect(remoteD1Database(credentials).select().from(polls)).rejects.toThrow(
      "Failed query",
    );
  });
});
