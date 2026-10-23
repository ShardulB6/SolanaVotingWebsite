import { Connection } from "@solana/web3.js";

export const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || "https://api.devnet.solana.com";
export { MEMO_PROGRAM } from "./results";
let connection: Connection | undefined;
export const getConnection = () => (connection ??= new Connection(RPC_URL, "confirmed"));
export const explorerUrl = (address: string, transaction = false) =>
  `https://explorer.solana.com/${transaction ? "tx" : "address"}/${address}?cluster=devnet`;
