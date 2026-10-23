import { PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import bs58 from "bs58";

export const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export type SignedBallot = {
  voter: string;
  option: number;
  message: string;
  signature: string;
};
export type ResultsRecord = {
  format: "huskyvote-results-v1";
  poll: {
    id: string;
    creator: string;
    title: string;
    description: string;
    options: string[];
    createdAt: number;
    closesAt: number;
  };
  counts: number[];
  ballots: SignedBallot[];
};

export function ballotMessage(input: {
  origin: string;
  poll: string;
  voter: string;
  option: number;
  question: string;
  choice: string;
  nonce: string;
  expiresAt: number;
}) {
  return JSON.stringify({ format: "huskyvote-ballot-v1", ...input });
}

export async function verifyBallot(ballot: SignedBallot) {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(new PublicKey(ballot.voter).toBytes()),
      "Ed25519",
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      new Uint8Array(bs58.decode(ballot.signature)),
      new TextEncoder().encode(ballot.message),
    );
  } catch {
    return false;
  }
}

// Fixed field order and bytewise voter order make exports reproducible.
export function canonicalResults(record: ResultsRecord) {
  const { poll } = record;
  return JSON.stringify({
    format: record.format,
    poll: {
      id: poll.id,
      creator: poll.creator,
      title: poll.title,
      description: poll.description,
      options: poll.options,
      createdAt: poll.createdAt,
      closesAt: poll.closesAt,
    },
    counts: record.counts,
    ballots: [...record.ballots]
      .sort((a, b) => (a.voter < b.voter ? -1 : a.voter > b.voter ? 1 : 0))
      .map(({ voter, option, message, signature }) => ({ voter, option, message, signature })),
  });
}

export async function resultsDigest(record: ResultsRecord) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalResults(record)),
  );
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function anchorMemo(poll: string, digest: string) {
  return `HuskyVote results v1\npoll:${poll}\nsha256:${digest}`;
}

export async function verifyResultsRecord(record: ResultsRecord) {
  if (record.format !== "huskyvote-results-v1") return false;
  const seen = new Set<string>();
  const counts = record.poll.options.map(() => 0);
  for (const ballot of record.ballots) {
    if (
      seen.has(ballot.voter) ||
      !Number.isInteger(ballot.option) ||
      ballot.option < 0 ||
      ballot.option >= counts.length ||
      !(await verifyBallot(ballot))
    )
      return false;
    seen.add(ballot.voter);
    try {
      const message = JSON.parse(ballot.message);
      if (
        message.format !== "huskyvote-ballot-v1" ||
        message.poll !== record.poll.id ||
        message.voter !== ballot.voter ||
        message.option !== ballot.option ||
        message.question !== record.poll.title ||
        message.choice !== record.poll.options[ballot.option]
      )
        return false;
    } catch {
      return false;
    }
    counts[ballot.option]++;
  }
  return (
    counts.length === record.counts.length && counts.every((value, i) => value === record.counts[i])
  );
}

export function verifyAnchorTransaction(
  transaction: ParsedTransactionWithMeta | null,
  creator: string,
  poll: string,
  digest: string,
) {
  if (!transaction)
    throw new Error("The anchor is not finalized yet. Wait a moment and retry publishing.");
  if (!transaction.meta || transaction.meta.err) throw new Error("The anchor transaction failed.");
  const signedByCreator = transaction.transaction.message.accountKeys.some(
    (key) => key.signer && key.pubkey.toBase58() === creator,
  );
  const matchingMemo = transaction.transaction.message.instructions.some(
    (instruction) =>
      instruction.programId.equals(MEMO_PROGRAM) &&
      "parsed" in instruction &&
      instruction.parsed === anchorMemo(poll, digest),
  );
  if (!signedByCreator || !matchingMemo)
    throw new Error("This transaction does not anchor these results with the creator's signature.");
  return true;
}
