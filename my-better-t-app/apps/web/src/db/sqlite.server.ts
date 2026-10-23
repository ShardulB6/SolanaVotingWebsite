import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import * as schema from "./schema";

export async function openSqlite(path: string, migrationsFolder = "migrations") {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  const db = drizzle(
    async (sql, params, method) => {
      const statement = sqlite.prepare(sql);
      statement.setReturnArrays(true);
      if (method === "run") {
        statement.run(...params);
        return { rows: [] };
      }
      // Node types do not narrow after setReturnArrays(true).
      const rows = statement.all(...params) as unknown as unknown[][];
      return { rows: method === "get" ? (rows[0] ?? []) : rows };
    },
    { schema },
  );
  await migrate(
    db,
    async (queries) => {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        for (const query of queries) sqlite.exec(query);
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    { migrationsFolder },
  );
  return db;
}
