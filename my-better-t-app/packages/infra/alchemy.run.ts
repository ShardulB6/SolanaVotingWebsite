import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import "varlock/auto-load";

export const database = Cloudflare.D1.Database("voting", {
  migrations: "../../apps/web/migrations",
});

export const web = Cloudflare.Website.Vite("web", {
  rootDir: "../../apps/web",
  env: {
    DB: database,
    AUTH_SESSION_SECRET: Config.Redacted("AUTH_SESSION_SECRET"),
    NODE_ENV: "production",
  },
  compatibility: {
    flags: ["nodejs_compat"],
  },
  dev: {
    port: 3001,
  },
});

export type WebEnv = Cloudflare.InferEnv<typeof web>;

export default Alchemy.Stack(
  "my-better-t-app",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const db = yield* database;
    const webWorker = yield* web;

    return {
      web: webWorker.url,
      databaseId: db.databaseId,
      databaseName: db.databaseName,
    };
  }),
);
