import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Buffer } from "buffer";
import bs58 from "bs58";
import type { SolanaWallet } from "./wallet";
import type { PollInput } from "./polls-codec";
import {
  listPolls,
  readPoll,
  readReceipt,
  insertPoll,
  requestVote,
  submitVote,
  changePoll,
  readResults,
  recordAnchor,
} from "./voting-api";
import { anchorMemo, resultsDigest, verifyResultsRecord } from "./results";
import { getConnection, MEMO_PROGRAM } from "./solana";
export { explorerUrl, getConnection } from "./solana";

export const fetchPolls = () => listPolls();
export const fetchPoll = (address: string) =>
  /^[0-9a-f]{32}$/.test(address) ? readPoll({ data: address }) : Promise.resolve(null);
export const fetchReceipt = (poll: string, voter: string) => readReceipt({ data: { poll, voter } });

async function connectedAccount(wallet: SolanaWallet, address: string) {
  const { accounts } = await wallet.features["standard:connect"].connect();
  const account = accounts.find((candidate) => candidate.address === address);
  if (!account)
    throw new Error(
      "Switch your wallet to the account you used to sign in, or sign out and reconnect.",
    );
  return account;
}

async function sendInstruction(
  wallet: SolanaWallet,
  address: string,
  instruction: TransactionInstruction,
  onSubmitted: (submission: PendingAnchor) => void,
) {
  const { accounts } = await wallet.features["standard:connect"].connect();
  const account = accounts.find((candidate) => candidate.address === address);
  if (!account)
    throw new Error(
      "Switch your wallet to the account you used to sign in, or sign out and reconnect.",
    );
  if (!account.chains.includes("solana:devnet"))
    throw new Error("Switch your wallet to Solana Devnet before continuing.");
  const rpc = getConnection();
  const blockhash = await rpc.getLatestBlockhash();
  const transaction = new Transaction({ ...blockhash, feePayer: new PublicKey(address) }).add(
    instruction,
  );
  const bytes = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
  let signature: string;
  const sign = wallet.features["solana:signTransaction"];
  const send = wallet.features["solana:signAndSendTransaction"];
  if (sign) {
    const [result] = await sign.signTransaction({
      account,
      chain: "solana:devnet",
      transaction: bytes,
    });
    if (!result) throw new Error("Your wallet did not return a signed transaction.");
    signature = await rpc.sendRawTransaction(result.signedTransaction, { skipPreflight: false });
  } else if (send) {
    const [result] = await send.signAndSendTransaction({
      account,
      chain: "solana:devnet",
      transaction: bytes,
    });
    if (!result) throw new Error("Your wallet did not return a transaction signature.");
    signature = bs58.encode(result.signature);
  } else throw new Error("Choose a wallet that supports Solana transactions.");
  const submission = { ...blockhash, signature };
  onSubmitted(submission);
  return submission;
}

export async function createPoll(input: PollInput, nonce: Uint8Array) {
  const id = Array.from(nonce, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return insertPoll({ data: { id, input } });
}

export async function castVote(poll: string, option: number, wallet: SolanaWallet, voter: string) {
  const sign = wallet.features["solana:signMessage"];
  if (!sign) throw new Error("Choose a wallet that supports signing messages to vote without SOL.");
  const account = await connectedAccount(wallet, voter);
  const message = await requestVote({ data: { poll, option } });
  const [result] = await sign.signMessage({ account, message: new TextEncoder().encode(message) });
  if (!result || !Buffer.from(result.signedMessage).equals(Buffer.from(message)))
    throw new Error("Your wallet did not sign the requested vote message.");
  return submitVote({ data: { poll, message, signature: bs58.encode(result.signature) } });
}

export async function closePoll(poll: string) {
  await changePoll({ data: { poll, action: "close" } });
}
export async function deletePoll(poll: string) {
  await changePoll({ data: { poll, action: "delete" } });
}

type PendingAnchor = { signature: string; blockhash: string; lastValidBlockHeight: number };

export async function publishResults(
  poll: string,
  wallet: SolanaWallet,
  creator: string,
  onSubmitted: (signature: string) => void,
) {
  const results = await readResults({ data: poll });
  if (results.record.poll.creator !== creator)
    throw new Error("Only the creator can publish results.");
  if (
    !(await verifyResultsRecord(results.record)) ||
    (await resultsDigest(results.record)) !== results.digest
  )
    throw new Error("The results record contains invalid ballots or a mismatched hash.");
  if (results.anchorSignature) return results.anchorSignature;
  // Keep the signature across reloads so a failed finality/database check can
  // be retried without paying for another transaction.
  const key = `huskyvote-anchor:${poll}:${results.digest}`;
  let submission: PendingAnchor | undefined;
  try {
    const saved = window.localStorage.getItem(key);
    if (saved) submission = JSON.parse(saved);
  } catch {
    /* Storage can be unavailable in private wallet browsers. */
  }
  const rpc = getConnection();
  if (submission) {
    const {
      value: [status],
    } = await rpc.getSignatureStatuses([submission.signature], { searchTransactionHistory: true });
    if (
      status?.err ||
      (!status && (await rpc.getBlockHeight("finalized")) > submission.lastValidBlockHeight)
    ) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* Optional recovery storage. */
      }
      submission = undefined;
    }
  }
  if (!submission) {
    submission = await sendInstruction(
      wallet,
      creator,
      new TransactionInstruction({
        programId: MEMO_PROGRAM,
        keys: [{ pubkey: new PublicKey(creator), isSigner: true, isWritable: false }],
        data: Buffer.from(anchorMemo(poll, results.digest)),
      }),
      (submitted) => {
        try {
          window.localStorage.setItem(key, JSON.stringify(submitted));
        } catch {
          /* Optional recovery storage. */
        }
        onSubmitted(submitted.signature);
      },
    );
  }
  const { signature } = submission;
  onSubmitted(signature);
  const confirmation = await rpc.confirmTransaction(submission, "finalized");
  if (confirmation.value.err) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* Optional recovery storage. */
    }
    throw new Error("The anchor transaction failed. Please try again.");
  }
  await recordAnchor({ data: { poll, signature } });
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* Optional recovery storage. */
  }
  return signature;
}

export async function downloadResults(poll: string) {
  const { record, digest, anchorSignature } = await readResults({ data: poll });
  const exported = { record, digest, anchorSignature, network: "devnet" };
  downloadJson(`huskyvote-${poll}-results.json`, exported);
}

export function downloadJson(filename: string, value: unknown) {
  const file = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function votingError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Something went wrong. Please try again.";
  if (/reject|cancel|declin/i.test(message))
    return "Cancelled in your wallet. Nothing was submitted.";
  if (/insufficient|debit|no record of a prior credit/i.test(message))
    return "The creator's wallet needs a small amount of Devnet SOL to publish results. Voting is free.";
  if (/block height exceeded|expired|not confirmed|timeout/i.test(message))
    return "The request expired or confirmation is taking longer than expected. Refresh and check any transaction link before retrying.";
  return message;
}
