import { generateKeyPairSync, sign } from "node:crypto";

import { createSignInMessage } from "@solana/wallet-standard-util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const request = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  url: "http://localhost:3001/",
  cookieOptions: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (name: string) => request.cookies.get(name),
  setCookie: (name: string, value: string, options: Record<string, unknown>) => {
    request.cookies.set(name, value);
    request.cookieOptions = options;
  },
  getRequestUrl: () => new URL(request.url),
  setResponseHeader: vi.fn(),
}));

import { getAuthSession, issueChallenge, verifyWalletSignIn } from "./session.server";

// Encode the generated public key as the wallet's base58 Solana address.
function addressFromKey(bytes: Uint8Array) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
  let address = "";
  while (value > 0n) {
    address = alphabet[Number(value % 58n)] + address;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    address = "1" + address;
  }
  return address;
}

async function signedChallenge(overrides = {}) {
  const input = await issueChallenge();
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const key = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  const address = addressFromKey(key);
  const message = createSignInMessage({ ...input, domain: input.domain!, address, ...overrides });
  return {
    address,
    publicKey: Array.from(key),
    signedMessage: Array.from(message),
    signature: Array.from(sign(null, message, privateKey)),
  };
}

describe("wallet authentication", () => {
  beforeEach(() => {
    request.cookies.clear();
    request.url = "http://localhost:3001/";
    vi.stubEnv("AUTH_SESSION_SECRET", "test-only-session-secret-with-at-least-32-characters");
    vi.stubEnv("NODE_ENV", "test");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("verifies a real Ed25519 signature and restores the authenticated session", async () => {
    const data = await signedChallenge();
    await expect(verifyWalletSignIn(data)).resolves.toEqual({ address: data.address });
    const session = await getAuthSession();
    expect(session.user).toEqual({ address: data.address });
    expect(session.challenge).toBeUndefined();
    expect(request.cookieOptions).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    session.destroy();
    expect((await getAuthSession()).user).toBeUndefined();
  });

  it("requires a challenge and rejects reuse in the current browser session", async () => {
    const data = await signedChallenge();
    await verifyWalletSignIn(data);
    await expect(verifyWalletSignIn(data)).rejects.toThrow("expired");
  });

  it("rejects a forged signature without authenticating", async () => {
    const data = await signedChallenge();
    data.signature = Array(64).fill(0);
    await expect(verifyWalletSignIn(data)).rejects.toThrow("verify");
    expect((await getAuthSession()).user).toBeUndefined();
  });

  it("rejects a signed message with a different nonce", async () => {
    const data = await signedChallenge({ nonce: "differentnonce123" });
    await expect(verifyWalletSignIn(data)).rejects.toThrow("verify");
  });

  it("rejects a public key that does not match the claimed address", async () => {
    const data = await signedChallenge();
    data.address = "11111111111111111111111111111111";
    await expect(verifyWalletSignIn(data)).rejects.toThrow("verify");
  });

  it("rejects a challenge after five minutes", async () => {
    vi.useFakeTimers();
    const data = await signedChallenge();
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    await expect(verifyWalletSignIn(data)).rejects.toThrow("expired");
  });

  it("rejects verification on a different origin", async () => {
    const data = await signedChallenge();
    request.url = "https://different.example/";
    await expect(verifyWalletSignIn(data)).rejects.toThrow("expired");
  });

  it("does not restore a tampered session cookie", async () => {
    const data = await signedChallenge();
    await verifyWalletSignIn(data);
    request.cookies.set("husky-session", "tampered-cookie");
    expect((await getAuthSession()).user).toBeUndefined();
  });

  it("requires secure cookies in production and refuses a missing secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await issueChallenge();
    expect(request.cookieOptions.secure).toBe(true);
    vi.stubEnv("AUTH_SESSION_SECRET", "");
    await expect(getAuthSession()).rejects.toThrow("AUTH_SESSION_SECRET");
  });
});
