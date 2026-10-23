import { sql } from "drizzle-orm";
import { check, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const polls = sqliteTable("polls", {
  id: text("id").primaryKey(),
  creator: text("creator").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  options: text("options", { mode: "json" }).$type<string[]>().notNull(),
  createdAt: integer("created_at").notNull(),
  closesAt: integer("closes_at").notNull(),
  closed: integer("closed", { mode: "boolean" }).notNull().default(false),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  anchorSignature: text("anchor_signature"),
  anchorDigest: text("anchor_digest"),
});

export const ballots = sqliteTable(
  "ballots",
  {
    poll: text("poll")
      .notNull()
      .references(() => polls.id),
    voter: text("voter").notNull(),
    option: integer("option").notNull(),
    message: text("message").notNull(),
    signature: text("signature").notNull(),
    receivedAt: integer("received_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.poll, table.voter] }),
    check("valid_option", sql`${table.option} >= 0 AND ${table.option} < 6`),
  ],
);

export const challenges = sqliteTable(
  "vote_challenges",
  {
    poll: text("poll")
      .notNull()
      .references(() => polls.id),
    voter: text("voter").notNull(),
    option: integer("option").notNull(),
    message: text("message").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.poll, table.voter] })],
);
