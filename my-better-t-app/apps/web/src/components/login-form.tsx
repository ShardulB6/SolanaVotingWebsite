import type { AuthUser } from "../lib/auth";
import type { SolanaWallet } from "../lib/wallet";

import { Button } from "@my-better-t-app/ui/components/button";
import { Card, CardContent } from "@my-better-t-app/ui/components/card";
import { Link, useRouter } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ExternalLink,
  Leaf,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useState } from "react";

import { signOut } from "../lib/auth";
import { hackDay } from "../lib/event";
import { signInWithWallet, useSolanaWallets } from "../lib/wallet";

export function LoginForm({ user }: { user: AuthUser | null }) {
  const router = useRouter();
  const wallets = useSolanaWallets();
  const [busyWallet, setBusyWallet] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showWallets, setShowWallets] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function connect(wallet: SolanaWallet) {
    setError("");
    setBusyWallet(wallet.name);
    try {
      await signInWithWallet(wallet);
      await router.invalidate();
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Something went wrong. Please try again.";
      setError(
        /reject|cancel|declin/i.test(message)
          ? "Sign-in was cancelled. You can try again whenever you're ready."
          : message,
      );
    } finally {
      setBusyWallet(null);
    }
  }

  async function logout() {
    setError("");
    setSigningOut(true);
    try {
      await signOut();
      await router.invalidate();
    } catch {
      setError("We couldn't sign you out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <a
        href="/"
        className="mb-2 flex items-center justify-center gap-2.5 text-sm font-semibold tracking-tight text-stone-800"
      >
        <span className="flex size-8 items-center justify-center rounded-lg bg-[#efe7db] text-[#785531]">
          <Leaf className="size-4" aria-hidden="true" />
        </span>
        {hackDay.organizer}
        <span className="border-l border-stone-300 pl-2.5 font-normal text-stone-500">
          Hack Day Toronto
        </span>
      </a>

      <Card className="overflow-hidden rounded-2xl bg-white p-0 text-sm shadow-sm ring-stone-200/80">
        <CardContent className="grid p-0 md:grid-cols-2">
          <section
            aria-labelledby="login-title"
            className="flex min-h-[540px] flex-col justify-center p-7 sm:p-10 lg:px-12 lg:py-14"
          >
            <div className="mb-8 flex flex-col items-center gap-3 text-center">
              <span className="mb-1 flex size-12 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-700">
                {user ? (
                  <Check className="size-5" aria-hidden="true" />
                ) : (
                  <Wallet className="size-5" aria-hidden="true" />
                )}
              </span>
              <h1
                id="login-title"
                className="text-3xl font-semibold tracking-[-0.04em] text-stone-900"
              >
                {user ? "You're signed in" : "Welcome, builders"}
              </h1>
              <p className="max-w-72 text-sm leading-6 text-stone-500">
                {user
                  ? "Your wallet is verified for the Hack Day voting project."
                  : "Connect your Solana wallet to the Hack Day community voting project."}
              </p>
            </div>

            <div className="mb-6 space-y-3 rounded-lg border border-stone-200 bg-stone-50/70 p-3.5 text-xs leading-5 text-stone-600">
              <p className="flex items-start gap-2.5">
                <CalendarDays
                  className="mt-0.5 size-3.5 shrink-0 text-stone-400"
                  aria-hidden="true"
                />
                <span>
                  <time dateTime={hackDay.dateTime}>{hackDay.date}</time> · {hackDay.time}
                </span>
              </p>
              <p className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-stone-400" aria-hidden="true" />
                <span>
                  {hackDay.venue}
                  <br />
                  {hackDay.address}
                </span>
              </p>
            </div>

            {user ? (
              <div className="flex flex-col gap-5">
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <span className="size-1.5 rounded-full bg-emerald-600" /> Verified wallet
                  </div>
                  <p className="break-all font-mono text-xs leading-6 text-stone-600">
                    {user.address}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="h-11 w-full rounded-lg text-sm"
                  disabled={signingOut}
                  onClick={logout}
                >
                  {signingOut && (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  )}
                  {signingOut ? "Signing out…" : "Sign out"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <Button
                  className="h-12 w-full justify-between rounded-lg bg-stone-900 px-4 text-sm text-white hover:bg-stone-800"
                  disabled={busyWallet !== null}
                  onClick={() =>
                    wallets.length === 1 ? connect(wallets[0]!) : setShowWallets(!showWallets)
                  }
                  aria-expanded={wallets.length !== 1 ? showWallets : undefined}
                  aria-controls={wallets.length !== 1 ? "wallet-options" : undefined}
                >
                  <span className="flex items-center gap-2.5">
                    {busyWallet ? (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Wallet className="size-4" aria-hidden="true" />
                    )}
                    {busyWallet ? "Approve in your wallet…" : "Connect Solana wallet"}
                  </span>
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>

                {showWallets && (
                  <div
                    id="wallet-options"
                    className="flex flex-col gap-2 rounded-lg border border-stone-200 p-3"
                  >
                    {wallets.length ? (
                      wallets.map((wallet) => (
                        <Button
                          key={wallet.name}
                          variant="ghost"
                          className="h-11 justify-start gap-3 rounded-md px-3 text-sm"
                          disabled={busyWallet !== null}
                          onClick={() => connect(wallet)}
                        >
                          <img
                            src={wallet.icon}
                            alt=""
                            width="24"
                            height="24"
                            className="rounded-md"
                          />
                          {wallet.name}
                        </Button>
                      ))
                    ) : (
                      <>
                        <p className="px-1 pb-1 text-xs leading-5 text-stone-500">
                          No wallet detected. Install a wallet, then refresh this page. On mobile,
                          open this site in your wallet's browser.
                        </p>
                        <a
                          href="https://phantom.com/download"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm text-stone-800 hover:bg-stone-50"
                        >
                          Get Phantom <ExternalLink className="size-3.5" aria-hidden="true" />
                        </a>
                        <a
                          href="https://www.solflare.com/download"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm text-stone-800 hover:bg-stone-50"
                        >
                          Get Solflare <ExternalLink className="size-3.5" aria-hidden="true" />
                        </a>
                      </>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-3 text-[11px] text-stone-400">
                  <span className="h-px flex-1 bg-stone-200" />
                  YOUR WALLET. YOUR VOICE.
                  <span className="h-px flex-1 bg-stone-200" />
                </div>
                <p className="text-center text-xs leading-5 text-stone-500">
                  New here? Your wallet is your account.
                  <br />
                  Just connect to get started.
                </p>
                <details className="group rounded-lg border border-stone-200 px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-stone-600 [&::-webkit-details-marker]:hidden">
                    How does sign-in work?
                    <ChevronDown
                      className="size-3.5 transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="mt-3 text-xs leading-5 text-stone-500">
                    Choose your wallet and approve the sign-in message. The message proves you own
                    your address. Signing in is free and does not send a transaction or give access
                    to your funds. Event registration is handled separately on MLH.
                  </p>
                </details>
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700"
              >
                {error}
              </p>
            )}
            <p role="status" className="sr-only">
              {busyWallet ? `Waiting for approval in ${busyWallet}` : ""}
            </p>
          </section>

          <div className="relative hidden flex-col justify-center overflow-hidden bg-[#f8b79e] md:flex">
            <div className="absolute inset-x-0 top-8 flex justify-center">
              <span className="rounded-full border border-[#6f431e]/15 px-3 py-1.5 text-[10px] font-medium tracking-[0.18em] text-[#613d22]">
                {hackDay.edition.toUpperCase()}
              </span>
            </div>
            <img
              src="/images/husky-hacktober-fest.png"
              alt="Husky Hacktober Fest Toronto: a husky in an autumn forest with golden hills and a campsite."
              width="1200"
              height="600"
              className="h-auto w-full"
              fetchPriority="high"
            />
            <div className="px-8 pb-9 pt-7 text-center text-[#513716]">
              <h2 className="text-2xl font-semibold leading-tight tracking-tight">
                {hackDay.title}
              </h2>
              <p className="mx-auto mt-3 max-w-xs text-xs leading-5 text-[#724c30]">
                {hackDay.description}
              </p>
              <a
                href={hackDay.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium underline decoration-[#724c30]/40 underline-offset-4 hover:decoration-current"
              >
                Event details & registration
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      <nav
        aria-label="Hack Day Solana resources"
        className="flex flex-col items-center gap-3 text-xs text-stone-500"
      >
        <p>Building at Hack Day? Explore the event’s Solana resources.</p>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-3">
          {hackDay.resources.map((resource) => (
            <a
              key={resource.href}
              href={resource.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline decoration-stone-300 underline-offset-4 hover:text-stone-800 hover:decoration-stone-600"
            >
              {resource.label}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ))}
        </div>
        <a
          href={hackDay.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 underline decoration-stone-300 underline-offset-4 hover:text-stone-800 md:hidden"
        >
          Event details & registration on MLH
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </nav>

      <footer className="flex flex-col items-center gap-3 text-center text-xs text-stone-500">
        <p className="flex items-center justify-center gap-1.5">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
          No passwords. No transaction fees. Just you and your wallet.
        </p>
        <p>
          Open source under the{" "}
          <Link
            to="/license"
            className="underline decoration-stone-300 underline-offset-4 hover:text-stone-800 hover:decoration-stone-600"
          >
            MIT License
          </Link>
          .
        </p>
      </footer>
    </div>
  );
}
