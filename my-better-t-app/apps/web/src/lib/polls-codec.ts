import { Buffer } from "buffer";
import { PublicKey } from "@solana/web3.js";

export const POLL_DISCRIMINATOR = Buffer.from([110, 234, 167, 188, 231, 136, 153, 111]);
export const RECEIPT_DISCRIMINATOR = Buffer.from([104, 20, 204, 252, 45, 84, 37, 195]);
export const CREATE_POLL = Buffer.from([182, 171, 112, 238, 6, 219, 14, 110]);
export const CAST_VOTE = Buffer.from([20, 212, 15, 189, 69, 180, 69, 151]);
export const CLOSE_POLL = Buffer.from([139, 213, 162, 65, 172, 150, 123, 67]);

export type Poll = {
  address: string;
  creator: string;
  nonce: Uint8Array;
  createdAt: number;
  closesAt: number;
  closed: boolean;
  title: string;
  description: string;
  options: string[];
  votes: number[];
};

export type PollInput = { title: string; description: string; options: string[]; closesAt: number };
export type VoteReceipt = { poll: string; voter: string; option: number };

export function validatePoll(input: PollInput, now = Date.now() / 1000) {
  const bytes = (value: string) => new TextEncoder().encode(value).length;
  if (!input.title.trim() || bytes(input.title) > 100) {
    throw new Error("Enter a question using at most 100 UTF-8 bytes.");
  }
  if (bytes(input.description) > 280)
    throw new Error("Keep the description within 280 UTF-8 bytes.");
  if (
    input.options.length < 2 ||
    input.options.length > 6 ||
    input.options.some((option) => !option.trim() || bytes(option) > 60) ||
    new Set(input.options.map((option) => option.trim().toLowerCase())).size !==
      input.options.length
  )
    throw new Error("Add 2–6 different options, each within 60 UTF-8 bytes.");
  if (
    !Number.isSafeInteger(input.closesAt) ||
    input.closesAt <= now ||
    input.closesAt > now + 30 * 86400
  ) {
    throw new Error("Choose a closing time in the next 30 days.");
  }
}

function stringBytes(value: string) {
  const bytes = Buffer.from(value, "utf8");
  const size = Buffer.alloc(4);
  size.writeUInt32LE(bytes.length);
  return Buffer.concat([size, bytes]);
}

export function encodeCreatePoll(input: PollInput, nonce: Uint8Array) {
  validatePoll(input);
  if (nonce.length !== 16) throw new Error("Invalid poll identifier.");
  const count = Buffer.alloc(4);
  count.writeUInt32LE(input.options.length);
  const deadline = Buffer.alloc(8);
  deadline.writeBigInt64LE(BigInt(input.closesAt));
  return Buffer.concat([
    CREATE_POLL,
    Buffer.from(nonce),
    stringBytes(input.title),
    stringBytes(input.description),
    count,
    ...input.options.map(stringBytes),
    deadline,
  ]);
}

class Reader {
  private offset = 8;
  constructor(
    private data: Buffer,
    discriminator: Buffer,
  ) {
    if (!data.subarray(0, 8).equals(discriminator)) throw new Error("Invalid account type.");
  }
  bytes(length: number) {
    if (this.offset + length > this.data.length) throw new Error("Incomplete account data.");
    const bytes = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }
  address() {
    return new PublicKey(this.bytes(32)).toBase58();
  }
  u8() {
    return this.bytes(1)[0]!;
  }
  u32() {
    return this.bytes(4).readUInt32LE();
  }
  integer(signed = false) {
    const bytes = this.bytes(8);
    const value = Number(signed ? bytes.readBigInt64LE() : bytes.readBigUInt64LE());
    if (!Number.isSafeInteger(value)) throw new Error("Account integer is out of range.");
    return value;
  }
  string(max: number) {
    const length = this.u32();
    if (length > max) throw new Error("Invalid account string length.");
    return new TextDecoder("utf-8", { fatal: true }).decode(this.bytes(length));
  }
}

export function decodePoll(address: string, data: Uint8Array): Poll {
  const reader = new Reader(Buffer.from(data), POLL_DISCRIMINATOR);
  const creator = reader.address();
  const nonce = reader.bytes(16);
  const createdAt = reader.integer(true);
  const closesAt = reader.integer(true);
  const closed = reader.u8() !== 0;
  const title = reader.string(100);
  const description = reader.string(280);
  const count = reader.u32();
  if (count < 2 || count > 6) throw new Error("Invalid poll options.");
  const options = Array.from({ length: count }, () => reader.string(60));
  const votes = Array.from({ length: 6 }, () => reader.integer());
  reader.u8(); // PDA bump
  return {
    address,
    creator,
    nonce,
    createdAt,
    closesAt,
    closed,
    title,
    description,
    options,
    votes: votes.slice(0, count),
  };
}

export function decodeReceipt(data: Uint8Array): VoteReceipt {
  const reader = new Reader(Buffer.from(data), RECEIPT_DISCRIMINATOR);
  const receipt = { poll: reader.address(), voter: reader.address(), option: reader.u8() };
  reader.u8();
  if (receipt.option >= 6) throw new Error("Invalid vote receipt.");
  return receipt;
}

export function pollAddress(program: PublicKey, creator: PublicKey, nonce: Uint8Array) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("poll"), creator.toBuffer(), Buffer.from(nonce)],
    program,
  )[0];
}

export function receiptAddress(program: PublicKey, poll: PublicKey, voter: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vote"), poll.toBuffer(), voter.toBuffer()],
    program,
  )[0];
}

export const totalVotes = (poll: Poll) => poll.votes.reduce((sum, votes) => sum + votes, 0);
export const pollIsOpen = (poll: Poll, now = Date.now() / 1000) =>
  !poll.closed && now < poll.closesAt;
export const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;
