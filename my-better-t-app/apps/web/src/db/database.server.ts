import type { D1Database } from "@cloudflare/workers-types";
import { drizzle, type AsyncRemoteCallback } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

// The proxy driver keeps the same Drizzle queries on D1 and local Node SQLite.
// All SQL and parameters come from Drizzle; this is never a public SQL endpoint.
export function d1Database(binding: D1Database) {
  const execute: AsyncRemoteCallback = async (sql, params, method) => {
    const statement = binding.prepare(sql).bind(...params);
    if (method === "run") {
      await statement.run();
      return { rows: [] };
    }
    const rows = await statement.raw();
    return { rows: method === "get" ? (rows[0] ?? []) : rows };
  };
  return drizzle(execute, { schema });
}

type D1Credentials = { accountId: string; databaseId: string; token: string };
export function remoteD1Database({ accountId, databaseId, token }: D1Credentials) {
  return drizzle(
    async (sql, params, method) => {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/raw`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ sql, params }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const data = (await response.json()) as {
        success: boolean;
        result?: { success: boolean; results?: { rows?: unknown[][] } }[];
      };
      if (!response.ok || !data.success || !data.result?.[0]?.success) {
        // Cloudflare error bodies may echo SQL/parameters; do not include them.
        throw new Error(
          "Cloudflare D1 is unavailable. Check the database configuration and try again.",
        );
      }
      const rows = data.result[0].results?.rows ?? [];
      return { rows: method === "get" ? (rows[0] ?? []) : rows };
    },
    { schema },
  );
}

export type VotingDatabase = ReturnType<typeof d1Database>;
let local: Promise<VotingDatabase> | undefined;

export async function getDatabase(): Promise<VotingDatabase> {
  let workerEnv;
  try {
    workerEnv = (await import("cloudflare:workers")).env;
  } catch {
    // Ordinary Node development has no cloudflare:workers module.
  }
  if (workerEnv) {
    if (!workerEnv.DB) throw new Error("The D1 database binding DB is missing.");
    return d1Database(workerEnv.DB);
  }
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_D1_TOKEN;
  if (accountId || databaseId || token) {
    if (!accountId || !databaseId || !token)
      throw new Error("Set all three Cloudflare D1 HTTP credentials.");
    return remoteD1Database({ accountId, databaseId, token });
  }
  if (import.meta.env.DEV) {
    local ??= import("./sqlite.server").then(({ openSqlite }) =>
      openSqlite(process.env.SQLITE_PATH || ".data/huskyvote.sqlite"),
    );
    return local;
  }
  throw new Error("Bind the Cloudflare D1 database as DB before serving the app.");
}
