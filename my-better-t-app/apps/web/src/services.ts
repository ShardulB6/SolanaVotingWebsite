import { type Database, createDb } from "@my-better-t-app/db";

import { ENV } from "./env.server";

export function getDb(): Database {
  return createDb(ENV);
}
