import type { SolanaSignInInput } from "@solana/wallet-standard-features";

import { verifySignIn } from "@solana/wallet-standard-util";
import {
  getCookie,
  getRequestUrl,
  setCookie,
  setResponseHeader,
} from "@tanstack/react-start/server";
import { getIronSession } from "iron-session";

import type { AuthUser } from "./auth";

import { hackDay } from "./event";
type AuthSession = { user: AuthUser; challenge: SolanaSignInInput };

export async function getAuthSession() {
  // Read at request time so hosting platforms can inject the secret at runtime.
  const password = process.env.AUTH_SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("Set AUTH_SESSION_SECRET to a random secret of at least 32 characters.");
  }
  setResponseHeader("Cache-Control", "private, no-store");
  return getIronSession<AuthSession>(
    { read: getCookie, write: setCookie },
    {
      cookieName: "husky-session",
      password,
      ttl: 60 * 60 * 24,
      cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      },
    },
  );
}

export async function issueChallenge() {
  const session = await getAuthSession();
  const url = getRequestUrl();
  const challenge: SolanaSignInInput = {
    domain: url.host,
    uri: url.origin,
    statement: `Sign in to the community voting project for ${hackDay.title}. This does not authorize any transactions.`,
    version: "1",
    nonce: crypto.randomUUID().replaceAll("-", ""),
    issuedAt: new Date().toISOString(),
    expirationTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };
  session.challenge = challenge;
  await session.save();
  return challenge;
}

export async function verifyWalletSignIn(data: {
  address: string;
  publicKey: number[];
  signedMessage: number[];
  signature: number[];
}) {
  const session = await getAuthSession();
  const challenge = session.challenge;
  delete session.challenge;
  await session.save();
  const url = getRequestUrl();
  if (
    !challenge?.expirationTime ||
    Date.parse(challenge.expirationTime) <= Date.now() ||
    challenge.domain !== url.host ||
    challenge.uri !== url.origin
  ) {
    throw new Error("Your sign-in request expired. Please try again.");
  }
  const valid = verifySignIn(challenge, {
    account: {
      address: data.address,
      publicKey: new Uint8Array(data.publicKey),
      chains: [],
      features: [],
    },
    signedMessage: new Uint8Array(data.signedMessage),
    signature: new Uint8Array(data.signature),
    signatureType: "ed25519",
  });
  if (!valid) throw new Error("We couldn't verify your wallet signature. Please try again.");
  session.user = { address: data.address };
  await session.save();
  return session.user;
}
