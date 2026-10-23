import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Keypair } from "@solana/web3.js";
import { beforeAll, afterAll, describe, expect, it } from "vite-plus/test";
import { d1Database } from "./database.server";
import { VotingStore } from "../lib/voting-store.server";
import { ballots } from "./schema";
import { createPrivateKey, sign } from "node:crypto";
import bs58 from "bs58";

let runtime: Miniflare;
let store: VotingStore;
let db: ReturnType<typeof d1Database>;
const id = "dc".repeat(16);
const origin = "https://hackathon.example";
beforeAll(async () => {
  runtime = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('D1'); } };",
    compatibilityDate: "2026-07-01",
    d1Databases: ["DB"],
  });
  const binding = await runtime.getD1Database("DB");
  const migration = readFileSync(
    new URL("../../migrations/0000_hybrid_voting.sql", import.meta.url),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint"))
    await binding.prepare(statement).run();
  db = d1Database(binding);
  store = new VotingStore(db);
  await store.create(Keypair.generate().publicKey.toBase58(), id, {
    title: "D1 hackathon poll",
    description: "",
    options: ["Cedar", "Maple"],
    closesAt: Math.floor(Date.now() / 1000) + 3600,
  });
});
afterAll(async () => runtime?.dispose());
describe("Cloudflare D1 runtime with Drizzle", () => {
  it("persists all 30 free signed ballots and rejects simultaneous duplicates atomically", async () => {
    const submitted = await Promise.all(
      Array.from({ length: 30 }, async (_, i) => {
        const key = Keypair.generate();
        const voter = key.publicKey.toBase58();
        const message = await store.challenge(id, voter, i % 2, origin);
        const privateKey = createPrivateKey({
          format: "jwk",
          key: {
            kty: "OKP",
            crv: "Ed25519",
            d: Buffer.from(key.secretKey.slice(0, 32)).toString("base64url"),
            x: Buffer.from(key.publicKey.toBytes()).toString("base64url"),
          },
        });
        return {
          voter,
          message,
          signature: bs58.encode(sign(null, Buffer.from(message), privateKey)),
        };
      }),
    );
    const results = await Promise.allSettled(
      submitted.flatMap((ballot) =>
        [0, 1].map(() => store.vote(id, ballot.voter, ballot.message, ballot.signature, origin)),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(30);
    expect((await store.get(id))?.votes).toEqual([15, 15]);
    expect((await store.list())[0].votes).toEqual([15, 15]);
    expect(await db.select().from(ballots)).toHaveLength(30);
  }, 30000);
});
