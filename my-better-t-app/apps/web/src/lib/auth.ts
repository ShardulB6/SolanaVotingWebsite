import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type AuthUser = { address: string };

const bytes = (length: number) => z.array(z.number().int().min(0).max(255)).length(length);

export const getCurrentUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getAuthSession } = await import("./session.server");
  const session = await getAuthSession();
  return session.user ?? null;
});

export const createSignInChallenge = createServerFn({ method: "POST" }).handler(async () => {
  const { issueChallenge } = await import("./session.server");
  return issueChallenge();
});

export const signIn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      address: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
      publicKey: bytes(32),
      signedMessage: z.array(z.number().int().min(0).max(255)).min(1).max(2048),
      signature: bytes(64),
    }),
  )
  .handler(async ({ data }) => {
    const { verifyWalletSignIn } = await import("./session.server");
    return verifyWalletSignIn(data);
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const { getAuthSession } = await import("./session.server");
  const session = await getAuthSession();
  session.destroy();
});
