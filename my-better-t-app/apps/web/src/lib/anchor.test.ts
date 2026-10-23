import { Connection, Keypair } from "@solana/web3.js";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { verifyAnchor } from "./anchor.server";
import { MEMO_PROGRAM } from "./solana";
import { anchorMemo } from "./results";
const creator = Keypair.generate().publicKey;
const poll = "01".repeat(16);
const digest = "ab".repeat(32);
const transaction = () => ({
  meta: { err: null },
  transaction: {
    message: {
      accountKeys: [{ pubkey: creator, signer: true }],
      instructions: [{ programId: MEMO_PROGRAM, parsed: anchorMemo(poll, digest) }],
    },
  },
});
afterEach(() => vi.restoreAllMocks());
describe("Solana results anchor verification", () => {
  it("requires a finalized successful transaction signed by the creator with the exact hash", async () => {
    const read = vi
      .spyOn(Connection.prototype, "getParsedTransaction")
      .mockResolvedValue(transaction() as never);
    await expect(
      verifyAnchor(
        new Connection("https://rpc.example"),
        "signature",
        creator.toBase58(),
        poll,
        digest,
      ),
    ).resolves.toBe(true);
    expect(read).toHaveBeenCalledWith("signature", {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    });
  });
  it.each(["unfinalized", "failed", "other signer", "wrong hash", "wrong poll", "wrong program"])(
    "rejects %s anchors",
    async (reason) => {
      const value = transaction();
      if (reason === "failed") value.meta.err = { InstructionError: [0, "fail"] } as never;
      if (reason === "other signer") value.transaction.message.accountKeys[0].signer = false;
      if (reason === "wrong hash")
        value.transaction.message.instructions[0].parsed = anchorMemo(poll, "cd".repeat(32));
      if (reason === "wrong poll")
        value.transaction.message.instructions[0].parsed = anchorMemo("02".repeat(16), digest);
      if (reason === "wrong program") value.transaction.message.instructions[0].programId = creator;
      vi.spyOn(Connection.prototype, "getParsedTransaction").mockResolvedValue(
        reason === "unfinalized" ? null : (value as never),
      );
      await expect(
        verifyAnchor(
          new Connection("https://rpc.example"),
          "signature",
          creator.toBase58(),
          poll,
          digest,
        ),
      ).rejects.toThrow();
    },
  );
});
