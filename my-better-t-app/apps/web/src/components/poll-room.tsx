import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@my-better-t-app/ui/components/button";
import { Card, CardContent } from "@my-better-t-app/ui/components/card";
import { Input } from "@my-better-t-app/ui/components/input";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock3,
  Copy,
  LoaderCircle,
  Maximize,
  Minimize,
  QrCode,
  Radio,
  ShieldCheck,
  Smartphone,
  Trash2,
  Vote,
} from "lucide-react";
import type { AuthUser } from "../lib/auth";
import {
  castVote,
  closePoll,
  deletePoll,
  explorerUrl,
  votingError,
  publishResults,
  downloadResults,
  downloadJson,
} from "../lib/polls";
import { checkAnchor } from "../lib/voting-api";
import { pollIsOpen, shortAddress, totalVotes, type Poll } from "../lib/polls-codec";
import { usePoll, useReceipt } from "../lib/use-polls";
import { useSolanaWallets } from "../lib/wallet";
import { VotingShell, WalletGate, actionClass, panelClass } from "./voting-shell";

export function PollRoom({ pollId, user }: { pollId: string; user: AuthUser | null }) {
  const live = usePoll(pollId);
  const [presenting, setPresenting] = useState(false);
  const [deletedId, setDeletedId] = useState<string | null>(null);
  const deleted = deletedId === pollId || !!live.data?.deleted;
  return (
    <VotingShell user={user} section="poll">
      <div
        className={presenting ? "fixed inset-0 z-40 overflow-auto bg-[#f8f9f6] p-5 sm:p-10" : ""}
      >
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-xs text-stone-500">
            <ArrowLeft className="size-3.5" /> Dashboard
          </Link>
          <Button
            variant="outline"
            className="h-9 gap-2 rounded-xl border-stone-200 bg-white text-xs"
            onClick={() => setPresenting((value) => !value)}
          >
            {presenting ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}
            {presenting ? "Exit presentation" : "Present poll"}
          </Button>
        </div>
        {live.error && !deleted && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800"
          >
            {live.error}
            <Button variant="link" onClick={live.refresh}>
              Try again
            </Button>
          </div>
        )}
        {live.loading && !live.data && (
          <div role="status" className="flex items-center gap-3 py-20 text-sm text-stone-500">
            <LoaderCircle className="size-5 animate-spin" /> Loading poll…
          </div>
        )}
        {live.data && !deleted && (
          <PollContent
            key={pollId}
            poll={live.data}
            user={user}
            presenting={presenting}
            error={!!live.error}
            refresh={live.refresh}
            onDeleted={() => {
              setDeletedId(pollId);
              live.refresh();
            }}
          />
        )}
        {(deleted || (!live.loading && !live.data && !live.error)) && (
          <div role="status" className="py-16 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              {deleted ? "Poll deleted" : "Poll unavailable"}
            </h1>
            <p className="mt-3 text-sm text-stone-500">
              {deleted
                ? "This poll has been removed. Voting and sharing are no longer available."
                : "This poll may have been deleted, or the link may be incorrect."}
            </p>
          </div>
        )}
      </div>
    </VotingShell>
  );
}

function PollContent({
  poll,
  user,
  presenting,
  error: connectionError,
  refresh,
  onDeleted,
}: {
  poll: Poll;
  user: AuthUser | null;
  presenting: boolean;
  error: boolean;
  refresh: () => void;
  onDeleted: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const open = pollIsOpen(poll, now / 1000);
  const total = totalVotes(poll);
  const leadingVotes = Math.max(...poll.votes);
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-7">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium ${open ? "bg-[#eaf2df] text-[#5c7b42]" : "bg-stone-200 text-stone-600"}`}
          >
            <span className={`size-1.5 rounded-full ${open ? "bg-[#7da45b]" : "bg-stone-400"}`} />
            {open ? "Voting is open" : "Voting has ended"}
          </span>
          <span className="text-[11px] text-stone-400">
            Created by {shortAddress(poll.creator)}
          </span>
        </div>
        <h1 className="max-w-3xl text-3xl leading-tight font-semibold tracking-[-0.04em] sm:text-4xl">
          {poll.title}
        </h1>
        {poll.description && (
          <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-500">{poll.description}</p>
        )}
      </div>
      <div
        className={`grid items-start gap-6 ${presenting ? "lg:grid-cols-[minmax(0,1fr)_380px]" : "xl:grid-cols-[minmax(0,1fr)_320px]"}`}
      >
        <div className="flex flex-col gap-6">
          <Card className={`${panelClass} order-2 sm:order-1`}>
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-stone-500">
                    {open ? "The room has spoken" : "Final results"}
                  </p>
                  <p className="mt-2 text-4xl font-semibold tracking-tight">
                    {total.toLocaleString()}{" "}
                    <span className="text-base font-normal text-stone-400">
                      {total === 1 ? "vote" : "votes"}
                    </span>
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] ${connectionError ? "bg-amber-50 text-amber-800" : "bg-[#f0f5e9] text-[#6f8556]"}`}
                >
                  <Radio className="size-3" />
                  {connectionError ? "Reconnecting" : "Updates every 5s"}
                </span>
              </div>
              <div className="mt-8 space-y-6" aria-label="Poll results">
                {poll.options.map((option, index) => {
                  const count = poll.votes[index]!;
                  const percentage = total ? Math.round((count / total) * 100) : 0;
                  const leading = count === leadingVotes && count > 0;
                  return (
                    <div key={index}>
                      <div className="mb-2.5 flex items-center justify-between gap-4 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-stone-100 text-[10px] text-stone-500">
                            {String.fromCharCode(65 + index)}
                          </span>
                          <span className="break-words">{option}</span>
                        </span>
                        <span className="shrink-0 text-xs text-stone-400">
                          {count.toLocaleString()}{" "}
                          <span className="ml-3 font-semibold text-stone-700">{percentage}%</span>
                        </span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label={option}
                        aria-valuenow={percentage}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="h-3 overflow-hidden rounded-full bg-[#f0f2eb]"
                      >
                        <div
                          className={`h-full rounded-full transition-[width] duration-700 ease-out ${leading ? "bg-[#88a66a]" : "bg-[#becbb0]"}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {total === 0 && (
                <p className="mt-7 text-center text-xs text-stone-400">
                  A good conversation starts with one vote.
                </p>
              )}
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-5 text-[11px] text-stone-400">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5" /> Signed ballots · off-chain
                </span>
                <span>Final results can be anchored on Solana</span>
              </div>
            </CardContent>
          </Card>
          {!presenting && (
            <div className="order-1 sm:order-2">
              <VotingForm
                key={`${poll.address}:${user?.address ?? "guest"}`}
                poll={poll}
                user={user}
                open={open}
                refresh={refresh}
              />
            </div>
          )}
        </div>
        <div className="space-y-5">
          <SharePoll poll={poll} open={open} />
          {!open && <ResultPublication poll={poll} user={user} refresh={refresh} />}
          <div className="flex items-start gap-2 px-2 text-[11px] leading-6 text-stone-400">
            <Clock3 className="mt-1 size-3.5 shrink-0" />
            <p>
              {open ? "Closes" : poll.closed ? "Voting ended early. Original deadline:" : "Closed"}{" "}
              <time dateTime={new Date(poll.closesAt * 1000).toISOString()}>
                {new Date(poll.closesAt * 1000).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </time>
            </p>
          </div>
          {!presenting && user?.address === poll.creator && (
            <CreatorPollControls
              key={`${poll.address}:${user.address}`}
              poll={poll}
              open={open}
              refresh={refresh}
              onDeleted={onDeleted}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SharePoll({ poll, open }: { poll: Poll; open: boolean }) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const configured = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
    try {
      const origin = new URL(configured || window.location.origin);
      if (!["http:", "https:"].includes(origin.protocol)) throw new Error("Invalid sharing URL");
      setUrl(new URL(`/polls/${poll.address}`, origin.origin).href);
    } catch {
      setError("The sharing URL is invalid. Ask the organizer for the correct link.");
    }
  }, [poll.address]);
  const local = url ? ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname) : false;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Copy the link from the field below.");
    }
  }
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Card className={`${panelClass} bg-[#eaf0df] ring-[#dce5cc]`}>
      <CardContent className="p-6 text-center sm:p-7">
        <div className="mb-2 flex items-center justify-center gap-2 text-[#6f8455]">
          <QrCode className="size-4" />
          <span className="text-[11px] font-medium tracking-wide">BRING EVERYONE IN</span>
        </div>
        <h2 className="text-xl font-semibold tracking-tight">
          {open ? "Scan. Sign in. Vote." : "Scan to see the results."}
        </h2>
        <p className="mt-2 text-xs leading-6 text-[#77846a]">
          {open
            ? "Open your camera, scan the code, and have your say with your Solana wallet."
            : "The votes are in. Share the results with your community."}
        </p>
        <div className="mx-auto my-6 flex aspect-square w-full max-w-64 items-center justify-center rounded-2xl bg-white p-5 shadow-xs">
          {url ? (
            <QRCodeSVG
              value={url}
              size={240}
              level="M"
              marginSize={2}
              title={`Open poll: ${poll.title}`}
              className="h-auto w-full"
            />
          ) : (
            <LoaderCircle className="size-6 animate-spin text-stone-300" />
          )}
        </div>
        <p className="mb-5 flex items-center justify-center gap-1.5 text-[10px] text-[#7e8d6d]">
          <Smartphone className="size-3.5" /> One wallet. One vote. Everyone welcome.
        </p>
        <Button
          variant="outline"
          onClick={copy}
          disabled={!url}
          className={`${actionClass} w-full border-[#d4dfc6] bg-white/70 text-[#4b613b] hover:bg-white`}
        >
          {copied ? <CheckCheck className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Link copied" : "Copy poll link"}
        </Button>
        <Input
          aria-label="Shareable poll link"
          value={url}
          readOnly
          onFocus={(event) => event.target.select()}
          className="mt-3 h-8 rounded-lg border-transparent bg-transparent text-center text-[10px] text-[#7e8d6d] shadow-none"
        />
        {local && (
          <p role="status" className="mt-3 text-[11px] leading-5 text-amber-900">
            This link points to this computer. A phone needs a reachable site URL; localhost won’t
            work.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-xs text-red-700">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function useTransactionWallet(address?: string, messages = false) {
  const wallets = useSolanaWallets().filter((wallet) =>
    messages
      ? "solana:signMessage" in wallet.features
      : "solana:signTransaction" in wallet.features ||
        "solana:signAndSendTransaction" in wallet.features,
  );
  const [walletName, setWalletName] = useState("");
  const wallet =
    wallets.find((candidate) => candidate.name === walletName) ??
    wallets.find((candidate) =>
      candidate.accounts.some((account) => account.address === address),
    ) ??
    (wallets.length === 1 ? wallets[0] : undefined);
  return { wallets, wallet, setWalletName };
}

function VotingForm({
  poll,
  user,
  open,
  refresh,
}: {
  poll: Poll;
  user: AuthUser | null;
  open: boolean;
  refresh: () => void;
}) {
  const receipt = useReceipt(poll.address, user?.address);
  const { wallets, wallet, setWalletName } = useTransactionWallet(user?.address, true);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  async function vote() {
    if (selected === null || !user) return;
    if (!wallet) {
      setError("Reconnect your signed-in wallet in its browser to approve the vote.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await castVote(poll.address, selected, wallet, user.address);
      setSubmitted(true);
      receipt.refresh();
      refresh();
    } catch (cause) {
      setError(votingError(cause));
      receipt.refresh();
    } finally {
      setBusy(false);
    }
  }
  if (!open && !receipt.data && !submitted)
    return (
      <p className="rounded-xl bg-stone-100 p-5 text-center text-sm text-stone-500">
        This poll is closed. You can still share and verify the results.
      </p>
    );
  if (!user)
    return (
      <WalletGate
        title="Have your say."
        description="Sign in with your Solana wallet to vote in this poll. You’ll stay right here after signing in."
      />
    );
  if (receipt.data || submitted)
    return (
      <Card className={`${panelClass} ring-[#cbdcbc]`}>
        <CardContent className="p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#eaf2df] text-[#6c8a4f]">
              <Check className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Your vote is saved.</h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                You voted for{" "}
                <span className="font-medium text-stone-800">
                  {poll.options[receipt.data?.option ?? selected ?? 0]}
                </span>
                . Thanks for being part of the conversation.
              </p>
              <p className="mt-4 text-xs text-[#6f8455]">
                Your signed ballot is saved. Final results can be anchored on Solana after voting
                ends.
              </p>
              {receipt.data && (
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() =>
                    downloadJson(`huskyvote-${poll.address}-receipt.json`, receipt.data)
                  }
                >
                  Download signed receipt
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  return (
    <Card className={panelClass}>
      <CardContent className="p-6 sm:p-8">
        <h2 className="text-lg font-semibold tracking-tight">What’s your pick?</h2>
        <p className="mt-2 text-xs text-stone-500">
          Choose one option. Your vote is public and final.
        </p>
        {receipt.error && (
          <p role="alert" className="mt-4 text-xs text-red-700">
            Couldn’t check your previous vote: {receipt.error}
            <Button variant="link" onClick={receipt.refresh}>
              Retry
            </Button>
          </p>
        )}
        <fieldset disabled={busy || receipt.loading || !!receipt.error} className="mt-6 space-y-3">
          <legend className="sr-only">Choose an option to vote for</legend>
          {poll.options.map((option, index) => (
            <label
              key={index}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors ${selected === index ? "border-[#9bb380] bg-[#f1f6e9]" : "border-stone-200 hover:bg-stone-50"}`}
            >
              <Input
                type="radio"
                name="vote"
                value={index}
                checked={selected === index}
                onChange={() => setSelected(index)}
                className="size-4 shrink-0 accent-[#668549]"
              />
              <span className="text-sm">{option}</span>
            </label>
          ))}
        </fieldset>
        {wallets.length > 1 && (
          <select
            aria-label="Transaction wallet"
            value={wallet?.name ?? ""}
            onChange={(event) => setWalletName(event.target.value)}
            disabled={busy}
            className="mt-4 h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm"
          >
            <option value="" disabled>
              Select your wallet
            </option>
            {wallets.map((candidate) => (
              <option key={candidate.name}>{candidate.name}</option>
            ))}
          </select>
        )}
        <Button
          className={`${actionClass} mt-6 w-full bg-[#263d2d] text-white hover:bg-[#354e3c] sm:w-auto`}
          disabled={selected === null || busy || receipt.loading || !!receipt.error}
          onClick={vote}
        >
          {busy || receipt.loading ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Vote className="size-4" />
          )}
          {receipt.loading
            ? "Checking your wallet…"
            : busy
              ? "Sign the vote in your wallet…"
              : "Confirm vote"}
        </Button>
        <p className="mt-3 text-[11px] leading-5 text-stone-400">
          Sign a free message in your wallet. No SOL is needed. One vote per wallet.
        </p>
        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-800">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CreatorPollControls({
  poll,
  open,
  refresh,
  onDeleted,
}: {
  poll: Poll;
  open: boolean;
  refresh: () => void;
  onDeleted: () => void;
}) {
  const [confirm, setConfirm] = useState<"close" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function choose(action: "close" | "delete" | null) {
    setConfirm(action);
    setError("");
  }
  async function submit() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      if (confirm === "delete") {
        await deletePoll(poll.address);
        onDeleted();
      } else {
        await closePoll(poll.address);
        refresh();
      }
      setConfirm(null);
    } catch (cause) {
      setError(votingError(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-xl border border-stone-200 p-4">
      <p className="mb-3 text-xs font-medium">You’re hosting this poll</p>
      {confirm ? (
        <>
          <p className="mb-3 text-xs leading-5 text-stone-500">
            {confirm === "delete"
              ? "Delete this poll? It will disappear from the dashboard, its link will stop working, and voting will stop immediately. This can’t be undone. Blockchain history stays public."
              : "End voting now? This can’t be undone."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" disabled={busy} className="rounded-lg" onClick={submit}>
              {busy && <LoaderCircle className="mr-2 size-3 animate-spin" />}
              {busy ? "Saving…" : confirm === "delete" ? "Delete permanently" : "End voting"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              className="rounded-lg"
              onClick={() => choose(null)}
            >
              {confirm === "delete" ? "Keep poll" : "Keep open"}
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          {open && (
            <Button
              variant="outline"
              className="w-full rounded-lg text-xs"
              onClick={() => choose("close")}
            >
              End voting early
            </Button>
          )}
          <Button
            variant="outline"
            className="w-full gap-2 rounded-lg border-red-100 text-xs text-red-700 hover:bg-red-50 hover:text-red-800"
            onClick={() => choose("delete")}
          >
            <Trash2 className="size-3.5" /> Delete poll
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function ResultPublication({
  poll,
  user,
  refresh,
}: {
  poll: Poll;
  user: AuthUser | null;
  refresh: () => void;
}) {
  const { wallet } = useTransactionWallet(user?.address);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signature, setSignature] = useState("");
  const [verified, setVerified] = useState("");
  async function run(action: "publish" | "download" | "verify") {
    setBusy(true);
    setError("");
    try {
      if (action === "download") await downloadResults(poll.address);
      else if (action === "verify") {
        const result = await checkAnchor({ data: poll.address });
        setVerified(result.digest);
      } else {
        if (!wallet || !user) throw new Error("Reconnect the creator’s wallet to publish results.");
        await publishResults(poll.address, wallet, user.address, setSignature);
        refresh();
      }
    } catch (cause) {
      setError(votingError(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className={panelClass}>
      <CardContent className="space-y-3 p-5">
        <h2 className="text-sm font-semibold">Final results on Solana</h2>
        <p className="text-xs leading-5 text-stone-500">
          {poll.anchorSignature
            ? "The creator published a hash of these results on Solana Devnet."
            : "Voting is free. The creator can publish the final results hash with one small Devnet transaction."}
        </p>
        <p className="text-[11px] leading-5 text-stone-500">
          The database prevents repeat votes. The on-chain hash lets people check that the published
          record has not changed.
        </p>
        {poll.anchorSignature ? (
          <>
            <a
              href={explorerUrl(poll.anchorSignature, true)}
              target="_blank"
              rel="noreferrer"
              className="block text-xs underline"
            >
              View Solana transaction
            </a>
            <Button variant="outline" disabled={busy} onClick={() => run("verify")}>
              Verify results and signatures
            </Button>
          </>
        ) : (
          user?.address === poll.creator && (
            <Button disabled={busy} onClick={() => run("publish")}>
              {busy
                ? "Publishing…"
                : signature
                  ? "Retry confirming publication"
                  : "Publish results on Solana"}
            </Button>
          )
        )}
        <Button variant="outline" disabled={busy} onClick={() => run("download")}>
          Download results record
        </Button>
        {signature && !poll.anchorSignature && (
          <a
            href={explorerUrl(signature, true)}
            target="_blank"
            rel="noreferrer"
            className="block text-xs underline"
          >
            Check submitted publication
          </a>
        )}
        {verified && (
          <p role="status" className="break-all text-xs text-green-800">
            Verified against Solana. SHA-256: {verified}
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-red-700">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
