import { readFile } from "node:fs/promises";
import { Connection } from "@solana/web3.js";
import {
  canonicalResults,
  resultsDigest,
  verifyAnchorTransaction,
  verifyResultsRecord,
} from "../src/lib/results.ts";

const [file, rpcUrl = "https://api.devnet.solana.com"] = process.argv.slice(2);
if (!file) throw new Error("Usage: node scripts/verify-results.ts <results.json> [devnet-rpc-url]");
const { record, digest, anchorSignature, network } = JSON.parse(await readFile(file, "utf8"));
if (network !== "devnet") throw new Error("Expected a Devnet results export.");
if (!(await verifyResultsRecord(record)))
  throw new Error("Invalid ballots, duplicate wallets, or mismatched counts.");
if ((await resultsDigest(record)) !== digest)
  throw new Error("The exported SHA-256 digest does not match the record.");
if (!anchorSignature) throw new Error("The record has not been anchored yet.");
const transaction = await new Connection(rpcUrl).getParsedTransaction(anchorSignature, {
  commitment: "finalized",
  maxSupportedTransactionVersion: 0,
});
verifyAnchorTransaction(transaction, record.poll.creator, record.poll.id, digest);
console.log(`Verified ${record.ballots.length} signed ballots and creator-signed Solana anchor.`);
console.log(`SHA-256: ${digest}`);
console.log(`Canonical record: ${Buffer.byteLength(canonicalResults(record))} bytes`);
