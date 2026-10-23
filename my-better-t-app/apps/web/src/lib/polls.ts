import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import bs58 from "bs58";

import {
  CAST_VOTE,
  CLOSE_POLL,
  POLL_DISCRIMINATOR,
  decodePoll,
  decodeReceipt,
  encodeCreatePoll,
  pollAddress,
  receiptAddress,
  type PollInput,
} from "./polls-codec";
import type { SolanaWallet } from "./wallet";

// Public build-time configuration. Deployment and hosting are intentionally independent.
const configuredProgram = import.meta.env.VITE_SOLANA_PROGRAM_ID?.trim();
export const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || "https://api.devnet.solana.com";
export const NETWORK = "devnet";
export const programId = (() => {
  try {
    return configuredProgram ? new PublicKey(configuredProgram) : null;
  } catch {
    return null;
  }
})();
let connection: Connection | undefined;
export function getConnection() {
  return (connection ??= new Connection(RPC_URL, "confirmed"));
}
function requireProgram() {
  if (!programId)
    throw new Error(
      "On-chain voting is not connected yet. The organizer needs to configure the poll program.",
    );
  return programId;
}
export const explorerUrl = (address: string, transaction = false) =>
  `https://explorer.solana.com/${transaction ? "tx" : "address"}/${address}?cluster=devnet`;

export async function fetchPolls() {
  const program = requireProgram();
  const accounts = await getConnection().getProgramAccounts(program, {
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(POLL_DISCRIMINATOR) } }],
  });
  return accounts
    .flatMap(({ pubkey, account }) => {
      try {
        const poll = decodePoll(pubkey.toBase58(), account.data);
        if (!pollAddress(program, new PublicKey(poll.creator), poll.nonce).equals(pubkey))
          return [];
        return [poll];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function fetchPoll(address: string) {
  const program = requireProgram();
  let key: PublicKey;
  try {
    key = new PublicKey(address);
  } catch {
    throw new Error("This poll link is invalid.");
  }
  const account = await getConnection().getAccountInfo(key);
  if (!account || !account.owner.equals(program))
    throw new Error("Poll not found on Solana Devnet. Check the link with its creator.");
  const poll = decodePoll(address, account.data);
  if (!pollAddress(program, new PublicKey(poll.creator), poll.nonce).equals(key))
    throw new Error("Invalid poll account.");
  return poll;
}

export async function fetchReceipt(poll: string, voter: string) {
  const program = requireProgram();
  const account = await getConnection().getAccountInfo(
    receiptAddress(program, new PublicKey(poll), new PublicKey(voter)),
  );
  if (!account) return null;
  if (!account.owner.equals(program)) throw new Error("Invalid vote receipt owner.");
  const receipt = decodeReceipt(account.data);
  if (receipt.poll !== poll || receipt.voter !== voter) throw new Error("Invalid vote receipt.");
  return receipt;
}

async function sendInstruction(
  wallet: SolanaWallet,
  address: string,
  instruction: TransactionInstruction,
  onSubmitted: (signature: string) => void,
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
  onSubmitted(signature);
  const confirmation = await rpc.confirmTransaction({ ...blockhash, signature }, "confirmed");
  if (confirmation.value.err)
    throw new Error("The transaction failed on Solana. Check its receipt before trying again.");
  return signature;
}

export async function createPoll(
  input: PollInput,
  nonce: Uint8Array,
  wallet: SolanaWallet,
  creator: string,
  onSubmitted: (signature: string) => void,
) {
  const program = requireProgram();
  const creatorKey = new PublicKey(creator);
  const poll = pollAddress(program, creatorKey, nonce);
  const instruction = new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: poll, isSigner: false, isWritable: true },
      { pubkey: creatorKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeCreatePoll(input, nonce),
  });
  await sendInstruction(wallet, creator, instruction, onSubmitted);
  return poll.toBase58();
}

export async function castVote(
  poll: string,
  option: number,
  wallet: SolanaWallet,
  voter: string,
  onSubmitted: (signature: string) => void,
) {
  const program = requireProgram();
  if (!Number.isInteger(option) || option < 0 || option >= 6)
    throw new Error("Choose a valid option.");
  if (await fetchReceipt(poll, voter))
    throw new Error("This wallet has already voted in this poll.");
  const pollKey = new PublicKey(poll);
  const voterKey = new PublicKey(voter);
  return sendInstruction(
    wallet,
    voter,
    new TransactionInstruction({
      programId: program,
      keys: [
        { pubkey: pollKey, isSigner: false, isWritable: true },
        { pubkey: receiptAddress(program, pollKey, voterKey), isSigner: false, isWritable: true },
        { pubkey: voterKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([CAST_VOTE, Buffer.from([option])]),
    }),
    onSubmitted,
  );
}

export async function closePoll(
  poll: string,
  wallet: SolanaWallet,
  creator: string,
  onSubmitted: (signature: string) => void,
) {
  return sendInstruction(
    wallet,
    creator,
    new TransactionInstruction({
      programId: requireProgram(),
      keys: [
        { pubkey: new PublicKey(poll), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(creator), isSigner: true, isWritable: false },
      ],
      data: CLOSE_POLL,
    }),
    onSubmitted,
  );
}

export function votingError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Something went wrong. Please try again.";
  if (/reject|cancel|declin/i.test(message))
    return "Cancelled in your wallet. Nothing was submitted.";
  if (/insufficient|debit|no record of a prior credit/i.test(message))
    return "Your wallet needs Devnet SOL for the transaction and account storage. Add test SOL and try again.";
  if (/block height exceeded|expired|not confirmed|timeout/i.test(message))
    return "Confirmation is taking longer than expected. Check the transaction link and refresh before trying again.";
  return message;
}
