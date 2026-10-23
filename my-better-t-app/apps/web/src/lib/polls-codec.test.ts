import { createHash } from "node:crypto";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { describe, expect, it } from "vite-plus/test";
import {
  CAST_VOTE,
  CLOSE_POLL,
  CREATE_POLL,
  DELETE_POLL,
  POLL_DISCRIMINATOR,
  RECEIPT_DISCRIMINATOR,
  decodePoll,
  decodeReceipt,
  encodeCreatePoll,
  pollAddress,
  receiptAddress,
  validatePoll,
} from "./polls-codec";

const program = new PublicKey("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkgMQHGfXXGY");
const creator = new PublicKey(new Uint8Array(32).fill(1));
const nonce = new Uint8Array(16).fill(2);
const input = () => ({
  title: "Question?",
  description: "",
  options: ["Yes", "No"],
  closesAt: Math.floor(Date.now() / 1000) + 3600,
});

describe("Solana poll wire format", () => {
  it("uses the actual Anchor discriminators", () => {
    for (const [name, bytes] of [
      ["global:create_poll", CREATE_POLL],
      ["global:cast_vote", CAST_VOTE],
      ["global:close_poll", CLOSE_POLL],
      ["global:delete_poll", DELETE_POLL],
      ["account:Poll", POLL_DISCRIMINATOR],
      ["account:VoteReceipt", RECEIPT_DISCRIMINATOR],
    ] as const) {
      expect(bytes).toEqual(createHash("sha256").update(name).digest().subarray(0, 8));
    }
  });

  it("keeps a maximum-sized create transaction within Solana's legacy packet limit", () => {
    const data = encodeCreatePoll(
      {
        ...input(),
        title: "x".repeat(100),
        description: "x".repeat(280),
        options: Array.from({ length: 6 }, (_, index) => `${index}${"x".repeat(59)}`),
      },
      nonce,
    );
    const transaction = new Transaction({
      feePayer: creator,
      recentBlockhash: SystemProgram.programId.toBase58(),
    }).add(
      new TransactionInstruction({
        programId: program,
        keys: [
          { pubkey: pollAddress(program, creator, nonce), isSigner: false, isWritable: true },
          { pubkey: creator, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      }),
    );
    expect(
      transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).length,
    ).toBeLessThanOrEqual(1232);
  });

  it("rejects duplicate choices, multibyte overflow, and expired deadlines", () => {
    expect(() => validatePoll({ ...input(), options: ["Yes", " YES "] })).toThrow(
      "different options",
    );
    expect(() => validatePoll({ ...input(), title: "🦊".repeat(26) })).toThrow("UTF-8");
    expect(() => validatePoll({ ...input(), options: ["Yes", "🦊".repeat(16)] })).toThrow("UTF-8");
    expect(() => validatePoll({ ...input(), closesAt: 1 })).toThrow("closing time");
  });

  it("rejects account confusion and truncated or oversized network data", () => {
    expect(() => decodePoll(creator.toBase58(), Buffer.alloc(1000))).toThrow("account type");
    expect(() => decodePoll(creator.toBase58(), POLL_DISCRIMINATOR)).toThrow("Incomplete");
    const malformed = Buffer.alloc(1000);
    POLL_DISCRIMINATOR.copy(malformed);
    malformed.writeUInt32LE(0xffffffff, 73);
    expect(() => decodePoll(creator.toBase58(), malformed)).toThrow("string length");
    expect(() => decodeReceipt(Buffer.concat([RECEIPT_DISCRIMINATOR, Buffer.alloc(65)]))).toThrow(
      "Incomplete",
    );
  });

  it("gives every election and voter their own deterministic receipt", () => {
    const poll = pollAddress(program, creator, nonce);
    const otherPoll = pollAddress(program, creator, new Uint8Array(16).fill(3));
    const receipt = receiptAddress(program, poll, creator);
    expect(receiptAddress(program, poll, creator).equals(receipt)).toBe(true);
    expect(receiptAddress(program, otherPoll, creator).equals(receipt)).toBe(false);
    expect(receiptAddress(program, poll, SystemProgram.programId).equals(receipt)).toBe(false);
  });
});
