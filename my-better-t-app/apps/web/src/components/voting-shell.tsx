import type { ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { Button } from "@my-better-t-app/ui/components/button";
import { Card, CardContent } from "@my-better-t-app/ui/components/card";
import {
  ArrowUpRight,
  LayoutDashboard,
  Leaf,
  LoaderCircle,
  LogOut,
  Plus,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { signOut, type AuthUser } from "../lib/auth";
import { shortAddress } from "../lib/polls-codec";
import { votingError } from "../lib/polls";
import { signInWithWallet, useSolanaWallets } from "../lib/wallet";

export const actionClass = "h-11 gap-2 rounded-xl px-5 text-sm font-medium";
export const panelClass = "rounded-2xl bg-white py-0 text-sm shadow-sm ring-stone-200/80";

export function VotingShell({
  user,
  children,
  section = "dashboard",
}: {
  user: AuthUser | null;
  children: ReactNode;
  section?: "dashboard" | "create" | "poll";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    try {
      await signOut();
      await router.invalidate();
    } catch (cause) {
      setError(votingError(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="voting-app min-h-svh bg-[#f8f9f6] text-stone-900">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-stone-200/80 bg-[#f1f3ed] px-5 py-7 lg:flex">
        <Link to="/dashboard" className="flex items-center gap-3 px-2">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#263d2d] text-[#d9edb7]">
            <Leaf className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            HuskyVote
            <span className="mt-0.5 block text-[9px] font-medium tracking-[0.08em] whitespace-nowrap text-stone-500 uppercase">
              Community, on chain
            </span>
          </span>
        </Link>
        <p className="mt-12 mb-3 px-3 text-[10px] font-semibold tracking-[0.15em] text-stone-400 uppercase">
          Workspace
        </p>
        <nav className="space-y-1.5" aria-label="Main navigation">
          <Link
            to="/dashboard"
            className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${section !== "create" ? "bg-white shadow-xs ring-1 ring-stone-200/60" : "text-stone-500 hover:bg-white/60"}`}
          >
            <LayoutDashboard className="size-4" /> Dashboard
          </Link>
          <Link
            to="/dashboard/new"
            className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${section === "create" ? "bg-white shadow-xs ring-1 ring-stone-200/60" : "text-stone-500 hover:bg-white/60"}`}
          >
            <Plus className="size-4" /> Create a poll
          </Link>
        </nav>
        <div className="mt-auto rounded-2xl border border-[#d8e2cd] bg-[#e8eddf] p-4">
          <ShieldCheck className="mb-3 size-5 text-[#536c3d]" />
          <p className="text-sm font-semibold">Every voice. Verifiable.</p>
          <p className="mt-2 text-xs leading-5 text-stone-500">
            Vote with a free wallet signature. Final results can be verified on Solana.
          </p>
          <a
            href="https://solana.com/docs"
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex items-center gap-1 text-xs font-medium text-[#3d5737]"
          >
            Explore Solana <ArrowUpRight className="size-3" />
          </a>
        </div>
        <div className="mt-5 flex items-center justify-between px-2 text-[11px] text-stone-400">
          <span>Built for HuskyHack</span>
          <Link to="/license">License</Link>
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="flex min-h-20 items-center justify-between gap-3 border-b border-stone-200/70 bg-white/70 px-5 sm:px-8 lg:px-10">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold lg:hidden">
            <Leaf className="size-5 text-[#536c3d]" /> HuskyVote
          </Link>
          <div className="hidden items-center gap-2 text-xs text-stone-400 lg:flex">
            <LayoutDashboard className="size-3.5" />
            <span>Workspace</span>
            <span className="mx-1">/</span>
            <span className="text-stone-700">
              {section === "create"
                ? "Create a poll"
                : section === "poll"
                  ? "Poll room"
                  : "Dashboard"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe5d2] bg-[#f3f7ee] px-2.5 py-1 text-[10px] font-medium text-[#5a7145]">
              <span className="size-1.5 rounded-full bg-[#8aa769]" /> Solana Devnet
            </span>
            {user && (
              <>
                <span className="hidden items-center gap-2 border-l border-stone-200 pl-4 font-mono text-xs text-stone-600 sm:flex">
                  <Wallet className="size-3.5" />
                  {shortAddress(user.address)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-lg text-stone-500"
                  onClick={logout}
                  disabled={busy}
                  aria-label="Sign out"
                >
                  {busy ? <LoaderCircle className="animate-spin" /> : <LogOut />}
                </Button>
              </>
            )}
          </div>
        </header>
        {error && (
          <p role="alert" className="px-5 pt-4 text-sm text-red-700">
            {error}
          </p>
        )}
        <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10 lg:px-10">{children}</main>
      </div>
    </div>
  );
}

export function WalletGate({
  title = "Your wallet. Your workspace.",
  description = "Sign in with your Solana wallet to create polls and make your voice count.",
}: {
  title?: string;
  description?: string;
}) {
  const wallets = useSolanaWallets();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  useEffect(() => {
    setPageUrl(window.location.href);
  }, []);
  async function connect(index: number) {
    const wallet = wallets[index]!;
    setBusy(wallet.name);
    setError("");
    try {
      await signInWithWallet(wallet);
      await router.invalidate();
    } catch (cause) {
      setError(votingError(cause));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Card className={`${panelClass} mx-auto max-w-lg`}>
      <CardContent className="p-7 text-center sm:p-10">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[#edf2e5] text-[#536c3d]">
          <Wallet className="size-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-stone-500">{description}</p>
        <div className="mt-7 space-y-3">
          {wallets.map((wallet, index) => (
            <Button
              key={wallet.name}
              className={`${actionClass} w-full bg-[#263d2d] text-white hover:bg-[#354e3c]`}
              disabled={!!busy}
              onClick={() => connect(index)}
            >
              {busy === wallet.name ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Wallet className="size-4" />
              )}{" "}
              {busy === wallet.name
                ? "Approve sign-in in your wallet…"
                : `Sign in with ${wallet.name}`}
            </Button>
          ))}
          {wallets.length === 0 && (
            <>
              <p className="rounded-xl bg-stone-50 p-4 text-sm leading-6 text-stone-600">
                Open this page in your Solana wallet’s browser, or install a wallet extension on
                desktop.
              </p>
              {pageUrl && (
                <a
                  className={`${actionClass} inline-flex w-full items-center justify-center bg-[#263d2d] text-white hover:bg-[#354e3c]`}
                  href={`https://phantom.app/ul/browse/${encodeURIComponent(pageUrl)}?ref=${encodeURIComponent(new URL(pageUrl).origin)}`}
                >
                  <Smartphone className="size-4" /> Open in Phantom
                </a>
              )}
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-stone-400">
          <ShieldCheck className="size-3.5" /> Sign-in is a message. It costs no SOL.
        </p>
      </CardContent>
    </Card>
  );
}
