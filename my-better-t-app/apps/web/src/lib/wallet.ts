import type {
  SolanaSignInFeature,
  SolanaSignMessageFeature,
  SolanaSignTransactionFeature,
  SolanaSignAndSendTransactionFeature,
} from "@solana/wallet-standard-features";
import type { Wallet } from "@wallet-standard/base";
import type { StandardConnectFeature } from "@wallet-standard/features";

import { createSignInMessage } from "@solana/wallet-standard-util";
import { getWallets } from "@wallet-standard/app";
import { useEffect, useState } from "react";

import { createSignInChallenge, signIn } from "./auth";

export type SolanaWallet = Wallet & {
  features: StandardConnectFeature &
    Partial<
      SolanaSignInFeature &
        SolanaSignMessageFeature &
        SolanaSignTransactionFeature &
        SolanaSignAndSendTransactionFeature
    >;
};

export function useSolanaWallets() {
  const [wallets, setWallets] = useState<SolanaWallet[]>([]);
  useEffect(() => {
    const registry = getWallets();
    const update = () =>
      setWallets(
        registry
          .get()
          .filter(
            (wallet): wallet is SolanaWallet =>
              wallet.chains.some((chain) => chain.startsWith("solana:")) &&
              "standard:connect" in wallet.features &&
              ("solana:signIn" in wallet.features || "solana:signMessage" in wallet.features),
          ),
      );
    update();
    const offRegister = registry.on("register", update);
    const offUnregister = registry.on("unregister", update);
    return () => {
      offRegister();
      offUnregister();
    };
  }, []);
  return wallets;
}

export async function signInWithWallet(wallet: SolanaWallet) {
  const challenge = await createSignInChallenge();
  const signInFeature = wallet.features["solana:signIn"];
  let output;
  if (signInFeature) {
    [output] = await signInFeature.signIn(challenge);
  } else {
    const { accounts } = await wallet.features["standard:connect"].connect();
    const account = accounts.find(
      (candidate) =>
        candidate.chains.some((chain) => chain.startsWith("solana:")) &&
        candidate.features.includes("solana:signMessage"),
    );
    const signMessageFeature = wallet.features["solana:signMessage"];
    if (!account || !signMessageFeature || !challenge.domain) {
      throw new Error("Choose a Solana account that supports signing messages.");
    }
    const [result] = await signMessageFeature.signMessage({
      account,
      message: createSignInMessage({
        ...challenge,
        domain: challenge.domain,
        address: account.address,
      }),
    });
    if (result) output = { ...result, account };
  }
  if (!output) throw new Error("Your wallet didn't return a signature. Please try again.");
  return signIn({
    data: {
      address: output.account.address,
      publicKey: Array.from(output.account.publicKey),
      signedMessage: Array.from(output.signedMessage),
      signature: Array.from(output.signature),
    },
  });
}
