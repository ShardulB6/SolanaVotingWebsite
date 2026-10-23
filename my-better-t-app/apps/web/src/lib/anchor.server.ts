import type { Connection } from "@solana/web3.js";
import { verifyAnchorTransaction } from "./results";

export async function verifyAnchor(
  rpc: Connection,
  signature: string,
  creator: string,
  poll: string,
  digest: string,
) {
  const transaction = await rpc.getParsedTransaction(signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });
  return verifyAnchorTransaction(transaction, creator, poll, digest);
}
