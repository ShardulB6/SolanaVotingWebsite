import { defineConfig } from "drizzle-kit";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} before migrating the remote D1 database.`);
  return value;
}
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
  driver: "d1-http",
  dbCredentials: {
    accountId: required("CLOUDFLARE_ACCOUNT_ID"),
    databaseId: required("CLOUDFLARE_D1_DATABASE_ID"),
    token: required("CLOUDFLARE_D1_TOKEN"),
  },
});
