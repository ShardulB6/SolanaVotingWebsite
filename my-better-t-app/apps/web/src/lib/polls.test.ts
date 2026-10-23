import { Connection, Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { SolanaWallet } from "./wallet";

const api = vi.hoisted(() => ({
  insertPoll: vi.fn(),
  requestVote: vi.fn(),
  submitVote: vi.fn(),
  changePoll: vi.fn(),
  readResults: vi.fn(),
  recordAnchor: vi.fn(),
}));
vi.mock("./voting-api", () => ({
  ...api,
  listPolls: vi.fn(),
  readPoll: vi.fn(),
  readReceipt: vi.fn(),
}));
import { castVote, closePoll, createPoll, deletePoll, publishResults } from "./polls";
import { MEMO_PROGRAM } from "./solana";
import { anchorMemo, resultsDigest, type ResultsRecord } from "./results";

const key = Keypair.generate();
const account = { address: key.publicKey.toBase58(), chains: ["solana:devnet"] };
const id = "01".repeat(16);
const message = "signed ballot message";
function wallet(features: Record<string, unknown> = {}) {
  return {
    features: {
      "standard:connect": { connect: vi.fn().mockResolvedValue({ accounts: [account] }) },
      ...features,
    },
  } as unknown as SolanaWallet;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("hybrid voting client", () => {
  it("creates and manages polls through the authenticated API without a transaction", async () => {
    const input = {
      title: "Question?",
      description: "",
      options: ["Yes", "No"],
      closesAt: 4102444800,
    };
    await createPoll(input, new Uint8Array(16).fill(1));
    expect(api.insertPoll).toHaveBeenCalledWith({ data: { id, input } });
    await closePoll(id);
    await deletePoll(id);
    expect(api.changePoll.mock.calls.map(([request]) => request.data.action)).toEqual([
      "close",
      "delete",
    ]);
  });
  it("only signs a free wallet message and submits its signature", async () => {
    api.requestVote.mockResolvedValue(message);
    const signMessage = vi.fn(async () => [
      { signedMessage: Buffer.from(message), signature: new Uint8Array(64).fill(1) },
    ]);
    const send = vi.spyOn(Connection.prototype, "sendRawTransaction");
    const getBalance = vi.spyOn(Connection.prototype, "getBalance");
    await castVote(id, 1, wallet({ "solana:signMessage": { signMessage } }), account.address);
    expect(signMessage).toHaveBeenCalledWith({
      account,
      message: new TextEncoder().encode(message),
    });
    expect(api.submitVote).toHaveBeenCalledWith({
      data: { poll: id, message, signature: expect.any(String) },
    });
    expect(send).not.toHaveBeenCalled();
    expect(getBalance).not.toHaveBeenCalled();
  });
  it("rejects unsupported wallets, account mismatches, and changed signed messages", async () => {
    await expect(castVote(id, 0, wallet(), account.address)).rejects.toThrow("signing messages");
    api.requestVote.mockResolvedValue(message);
    const signMessage = vi.fn(async () => [
      { signedMessage: Buffer.from("changed"), signature: new Uint8Array(64) },
    ]);
    await expect(
      castVote(id, 0, wallet({ "solana:signMessage": { signMessage } }), account.address),
    ).rejects.toThrow("requested vote");
    await expect(
      castVote(
        id,
        0,
        wallet({ "solana:signMessage": { signMessage } }),
        SystemProgram.programId.toBase58(),
      ),
    ).rejects.toThrow("Switch your wallet");
    expect(api.submitVote).not.toHaveBeenCalled();
  });
  it("publishes one creator-paid Memo and retries database recording without a new transaction", async () => {
    const record: ResultsRecord = {
      format: "huskyvote-results-v1",
      poll: {
        id,
        creator: account.address,
        title: "Question?",
        description: "",
        options: ["Yes", "No"],
        createdAt: 100,
        closesAt: 200,
      },
      counts: [0, 0],
      ballots: [],
    };
    const digest = await resultsDigest(record);
    api.readResults.mockResolvedValue({ record, digest, anchorSignature: null });
    const stored = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => stored.get(key),
        setItem: (key: string, value: string) => stored.set(key, value),
        removeItem: (key: string) => stored.delete(key),
      },
    });
    vi.spyOn(Connection.prototype, "getLatestBlockhash").mockResolvedValue({
      blockhash: SystemProgram.programId.toBase58(),
      lastValidBlockHeight: 42,
    });
    vi.spyOn(Connection.prototype, "getSignatureStatuses").mockResolvedValue({
      context: { slot: 1 },
      value: [{ slot: 1, confirmations: 1, err: null, confirmationStatus: "confirmed" }],
    });
    const send = vi
      .spyOn(Connection.prototype, "sendRawTransaction")
      .mockResolvedValue("signature");
    vi.spyOn(Connection.prototype, "confirmTransaction").mockResolvedValue({
      context: { slot: 1 },
      value: { err: null },
    });
    const signTransaction = vi.fn(async ({ transaction }: { transaction: Uint8Array }) => [
      { signedTransaction: transaction },
    ]);
    const hostWallet = wallet({ "solana:signTransaction": { signTransaction } });
    api.recordAnchor
      .mockRejectedValueOnce(new Error("Temporary database failure"))
      .mockResolvedValueOnce("signature");
    await expect(publishResults(id, hostWallet, account.address, vi.fn())).rejects.toThrow(
      "database",
    );
    expect(stored.size).toBe(1);
    await publishResults(id, hostWallet, account.address, vi.fn());
    expect(send).toHaveBeenCalledOnce();
    expect(stored.size).toBe(0);
    const tx = Transaction.from(signTransaction.mock.calls[0][0].transaction);
    expect(tx.feePayer?.equals(key.publicKey)).toBe(true);
    expect(tx.instructions).toHaveLength(1);
    expect(tx.instructions[0].programId.equals(MEMO_PROGRAM)).toBe(true);
    expect(tx.instructions[0].data.toString()).toBe(anchorMemo(id, digest));
    expect(api.recordAnchor).toHaveBeenCalledWith({ data: { poll: id, signature: "signature" } });
  });
});
