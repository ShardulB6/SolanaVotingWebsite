import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { DELETE_POLL, POLL_DISCRIMINATOR, pollAddress, pollIsOpen } from "./polls-codec";
import type { SolanaWallet } from "./wallet";

const program = new PublicKey("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkgMQHGfXXGY");
const creator = new PublicKey(new Uint8Array(32).fill(1));
const nonce = new Uint8Array(16).fill(2);
const address = pollAddress(program, creator, nonce);
let polls: typeof import("./polls");

// Uses the original account layout, with deletion encoded in the status byte.
function pollAccount(deleted: boolean, closed = false) {
  const string = (value: string) => {
    const size = Buffer.alloc(4);
    size.writeUInt32LE(Buffer.byteLength(value));
    return Buffer.concat([size, Buffer.from(value)]);
  };
  const times = Buffer.alloc(16);
  times.writeBigInt64LE(100n);
  times.writeBigInt64LE(4102444800n, 8);
  const count = Buffer.alloc(4);
  count.writeUInt32LE(2);
  const bump = PublicKey.findProgramAddressSync(
    [Buffer.from("poll"), creator.toBuffer(), Buffer.from(nonce)],
    program,
  )[1];
  return {
    owner: program,
    executable: false,
    lamports: 1,
    rentEpoch: 0,
    data: Buffer.concat([
      POLL_DISCRIMINATOR,
      creator.toBuffer(),
      Buffer.from(nonce),
      times,
      Buffer.from([deleted ? 2 : Number(closed)]),
      string("Question?"),
      string(""),
      count,
      string("Yes"),
      string("No"),
      Buffer.alloc(48),
      Buffer.from([bump]),
    ]),
  };
}

beforeAll(async () => {
  vi.stubEnv("VITE_SOLANA_PROGRAM_ID", program.toBase58());
  polls = await import("./polls");
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => vi.unstubAllEnvs());

describe("on-chain poll deletion", () => {
  it("excludes deleted polls from listings and counts", async () => {
    vi.spyOn(Connection.prototype, "getProgramAccounts").mockResolvedValue([
      { pubkey: address, account: pollAccount(false) },
      { pubkey: address, account: pollAccount(true) },
    ]);
    const listed = await polls.fetchPolls();
    expect(listed).toHaveLength(1);
    expect(listed[0].deleted).toBe(false);
    expect(pollIsOpen({ ...listed[0], deleted: true })).toBe(false);
  });

  it("reads legacy closed accounts without a trailing deletion field", async () => {
    vi.spyOn(Connection.prototype, "getAccountInfo").mockResolvedValue(pollAccount(false, true));
    const poll = await polls.fetchPoll(address.toBase58());
    expect(poll).toMatchObject({ closed: true, deleted: false, title: "Question?" });
  });

  it("returns unavailable for deleted and missing polls while loading active polls", async () => {
    vi.spyOn(Connection.prototype, "getAccountInfo")
      .mockResolvedValueOnce(pollAccount(false))
      .mockResolvedValueOnce(pollAccount(true))
      .mockResolvedValueOnce(null);
    expect((await polls.fetchPoll(address.toBase58()))?.title).toBe("Question?");
    expect(await polls.fetchPoll(address.toBase58())).toBeNull();
    expect(await polls.fetchPoll(address.toBase58())).toBeNull();
  });

  it("sends the deletion instruction on Devnet with the creator's signature and confirms it", async () => {
    vi.spyOn(Connection.prototype, "getLatestBlockhash").mockResolvedValue({
      blockhash: SystemProgram.programId.toBase58(),
      lastValidBlockHeight: 42,
    });
    const send = vi
      .spyOn(Connection.prototype, "sendRawTransaction")
      .mockResolvedValue("signature");
    const confirm = vi.spyOn(Connection.prototype, "confirmTransaction").mockResolvedValue({
      context: { slot: 1 },
      value: { err: null },
    });
    const account = { address: creator.toBase58(), chains: ["solana:devnet"] };
    const signTransaction = vi.fn(async ({ transaction }: { transaction: Uint8Array }) => [
      { signedTransaction: transaction },
    ]);
    const wallet = {
      features: {
        "standard:connect": { connect: vi.fn().mockResolvedValue({ accounts: [account] }) },
        "solana:signTransaction": { signTransaction },
      },
    } as unknown as SolanaWallet;
    const onSubmitted = vi.fn();
    expect(
      await polls.deletePoll(address.toBase58(), wallet, creator.toBase58(), onSubmitted),
    ).toBe("signature");
    const request = signTransaction.mock.calls[0][0];
    expect(request).toMatchObject({ account, chain: "solana:devnet" });
    const instruction = Transaction.from(request.transaction).instructions[0];
    expect(instruction.programId.equals(program)).toBe(true);
    expect(instruction.data).toEqual(DELETE_POLL);
    expect(instruction.keys).toEqual([
      { pubkey: address, isSigner: false, isWritable: true },
      // The creator is also the transaction fee payer, so is writable on the wire.
      { pubkey: creator, isSigner: true, isWritable: true },
    ]);
    expect(send).toHaveBeenCalledOnce();
    expect(onSubmitted).toHaveBeenCalledWith("signature");
    expect(confirm).toHaveBeenCalledWith(
      {
        blockhash: SystemProgram.programId.toBase58(),
        lastValidBlockHeight: 42,
        signature: "signature",
      },
      "confirmed",
    );
  });
});
