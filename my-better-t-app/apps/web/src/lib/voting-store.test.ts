import { Keypair } from "@solana/web3.js";
import { createPrivateKey, sign } from "node:crypto";
import { fileURLToPath } from "node:url";
import bs58 from "bs58";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { openSqlite } from "../db/sqlite.server";
import { polls, challenges } from "../db/schema";
import { VotingStore } from "./voting-store.server";
import { canonicalResults, resultsDigest, verifyResultsRecord } from "./results";

const origin = "https://vote.example.com";
const id = "01".repeat(16);
const creator = Keypair.generate();
const input = () => ({
  title: "Best project?",
  description: "Hackathon",
  options: ["Cedar", "Maple"],
  closesAt: Math.floor(Date.now() / 1000) + 3600,
});
function signature(message: string, key: Keypair) {
  const privateKey = createPrivateKey({
    format: "jwk",
    key: {
      kty: "OKP",
      crv: "Ed25519",
      d: Buffer.from(key.secretKey.slice(0, 32)).toString("base64url"),
      x: Buffer.from(key.publicKey.toBytes()).toString("base64url"),
    },
  });
  return bs58.encode(sign(null, Buffer.from(message), privateKey));
}
let db: Awaited<ReturnType<typeof openSqlite>>;
let store: VotingStore;
beforeEach(async () => {
  db = await openSqlite(":memory:", fileURLToPath(new URL("../../migrations", import.meta.url)));
  store = new VotingStore(db);
  await store.create(creator.publicKey.toBase58(), id, input());
});
async function ballot(key = Keypair.generate(), option = 0) {
  const voter = key.publicKey.toBase58();
  const message = await store.challenge(id, voter, option, origin);
  return { voter, option, message, signature: signature(message, key) };
}
async function vote(signed: Awaited<ReturnType<typeof ballot>>) {
  return store.vote(id, signed.voter, signed.message, signed.signature, origin);
}

describe("D1/SQLite signed voting through Drizzle", () => {
  it("accepts a real signature from a wallet with no funded on-chain account", async () => {
    const signed = await ballot();
    await vote(signed);
    expect((await store.get(id))?.votes).toEqual([1, 0]);
    expect(await store.receipt(id, signed.voter)).toMatchObject(signed);
  });
  it("allows exactly one of two simultaneous submissions and rejects replay", async () => {
    const signed = await ballot();
    const results = await Promise.allSettled([vote(signed), vote(signed)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await store.get(id))?.votes).toEqual([1, 0]);
    await expect(vote(signed)).rejects.toThrow("already voted");
    await expect(store.challenge(id, signed.voter, 1, origin)).rejects.toThrow("already voted");
  });
  it("rejects forged signatures and changed messages, identities, and origins", async () => {
    const signed = await ballot();
    await expect(
      vote({ ...signed, signature: signature(signed.message, Keypair.generate()) }),
    ).rejects.toThrow("signature");
    await expect(
      vote({ ...signed, message: signed.message.replace('"option":0', '"option":1') }),
    ).rejects.toThrow("expired");
    await expect(
      store.vote(
        id,
        Keypair.generate().publicKey.toBase58(),
        signed.message,
        signed.signature,
        origin,
      ),
    ).rejects.toThrow("expired");
    await expect(
      store.vote(id, signed.voter, signed.message, signed.signature, "https://other.example"),
    ).rejects.toThrow("expired");
    expect((await store.get(id))?.votes).toEqual([0, 0]);
  });
  it("rejects invalid options and expired or superseded challenges", async () => {
    await expect(store.challenge(id, creator.publicKey.toBase58(), 5, origin)).rejects.toThrow(
      "valid option",
    );
    const key = Keypair.generate();
    const old = await ballot(key);
    const current = await ballot(key, 1);
    await expect(vote(old)).rejects.toThrow("expired");
    await db.update(challenges).set({ expiresAt: 1 });
    await expect(vote(current)).rejects.toThrow("expired");
  });
  it.each(["close", "delete", "expire"])(
    "rejects a signed ballot when the poll subsequently %ss",
    async (action) => {
      const signed = await ballot();
      if (action === "expire") await db.update(polls).set({ closesAt: 1 }).where(eq(polls.id, id));
      else await store.change(id, creator.publicKey.toBase58(), action as "close" | "delete");
      await expect(vote(signed)).rejects.toThrow("closed");
      expect(await store.receipt(id, signed.voter)).toBeNull();
    },
  );
  it("only permits the creator to close/delete and retains the deleted poll tombstone", async () => {
    await expect(store.change(id, "someone-else", "delete")).rejects.toThrow("Only the creator");
    await store.change(id, creator.publicKey.toBase58(), "delete");
    expect(await store.get(id)).toBeNull();
    expect(await store.list()).toEqual([]);
    await expect(store.create(creator.publicKey.toBase58(), id, input())).rejects.toThrow(
      "identifier",
    );
  });
  it("handles all 30 hackathon voters without any Solana transactions", async () => {
    const signed = await Promise.all(
      Array.from({ length: 30 }, (_, i) => ballot(Keypair.generate(), i % 2)),
    );
    await Promise.all(signed.map(vote));
    expect((await store.get(id))?.votes).toEqual([15, 15]);
  });
  it("exports stable signed results, detects tampering, and prevents overwriting the saved anchor", async () => {
    await expect(store.results(id)).rejects.toThrow("End voting");
    await vote(await ballot());
    await vote(await ballot(Keypair.generate(), 1));
    await store.change(id, creator.publicKey.toBase58(), "close");
    const first = await store.results(id);
    expect(await verifyResultsRecord(first.record)).toBe(true);
    expect(first.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(
      await resultsDigest({ ...first.record, ballots: [...first.record.ballots].reverse() }),
    ).toBe(first.digest);
    expect(canonicalResults((await store.results(id)).record)).toBe(canonicalResults(first.record));
    const tampered = structuredClone(first.record);
    tampered.counts[0]++;
    expect(await verifyResultsRecord(tampered)).toBe(false);
    expect(await resultsDigest(tampered)).not.toBe(first.digest);
    const duplicate = structuredClone(first.record);
    duplicate.ballots.push(duplicate.ballots[0]);
    expect(await verifyResultsRecord(duplicate)).toBe(false);
    await store.saveAnchor(id, creator.publicKey.toBase58(), first.digest, "signature-a");
    await expect(
      store.saveAnchor(id, creator.publicKey.toBase58(), first.digest, "signature-b"),
    ).rejects.toThrow("different");
  });
});
