import { Link } from "@tanstack/react-router";
import { Button } from "@my-better-t-app/ui/components/button";
import { Card, CardContent } from "@my-better-t-app/ui/components/card";
import { Input } from "@my-better-t-app/ui/components/input";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Clock3,
  Layers,
  Plus,
  QrCode,
  Search,
  Sparkles,
  Vote,
} from "lucide-react";
import { useState } from "react";
import type { AuthUser } from "../lib/auth";
import { pollIsOpen, shortAddress, totalVotes, type Poll } from "../lib/polls-codec";
import { programId } from "../lib/polls";
import { usePolls } from "../lib/use-polls";
import { NetworkNotice, VotingShell, WalletGate, actionClass, panelClass } from "./voting-shell";

export function PollDashboard({ user }: { user: AuthUser | null }) {
  const live = usePolls();
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [search, setSearch] = useState("");
  const polls = (live.data ?? []).filter((poll) => !poll.deleted);
  const mine = polls.filter((poll) => poll.creator === user?.address);
  const displayed = (tab === "mine" ? mine : polls).filter((poll) =>
    poll.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <VotingShell user={user}>
      {!user ? (
        <div className="py-12">
          <WalletGate />
        </div>
      ) : (
        <>
          <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-[#71845d]">
                A little participation. A big difference.
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                Let’s put it to a vote.
              </h1>
              <p className="mt-3 text-sm leading-6 text-stone-500">
                Create a question, bring people together, and watch the votes come in.
              </p>
            </div>
            <Link
              to="/dashboard/new"
              className={`${actionClass} inline-flex items-center bg-[#263d2d] text-white hover:bg-[#354e3c]`}
            >
              <Plus className="size-4" /> Create a poll
            </Link>
          </div>
          {!programId && <NetworkNotice />}
          <section className="mb-8 grid gap-4 sm:grid-cols-3" aria-label="Your voting overview">
            {[
              {
                label: "Your polls",
                value: mine.length,
                icon: Layers,
                note: "Ideas you’ve put out there",
              },
              {
                label: "Open for voting",
                value: mine.filter((poll) => pollIsOpen(poll)).length,
                icon: BarChart3,
                note: "Ready for a little input",
              },
              {
                label: "Votes collected",
                value: mine.reduce((sum, poll) => sum + totalVotes(poll), 0),
                icon: Vote,
                note: "Voices, recorded on Solana",
              },
            ].map(({ label, value, icon: Icon, note }) => (
              <Card key={label} className={panelClass}>
                <CardContent className="p-5 sm:p-6">
                  <div className="flex items-center justify-between text-xs text-stone-500">
                    <span>{label}</span>
                    <span className="rounded-lg bg-[#f2f4ed] p-2 text-[#789161]">
                      <Icon className="size-4" />
                    </span>
                  </div>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">
                    {live.loading ? "—" : value.toLocaleString()}
                  </p>
                  <p className="mt-2 text-[11px] text-stone-400">{note}</p>
                </CardContent>
              </Card>
            ))}
          </section>
          <Card className={`${panelClass} mb-9 bg-[#eaf0df] ring-[#dce5cc]`}>
            <CardContent className="flex flex-col justify-between gap-5 p-6 sm:flex-row sm:items-center sm:p-7">
              <div className="flex items-start gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-[#ccd9ba] bg-white/50 text-[#647d49]">
                  <QrCode className="size-6" />
                </span>
                <div>
                  <p className="text-base font-semibold tracking-tight">
                    One scan. Every voice in the room.
                  </p>
                  <p className="mt-1.5 max-w-lg text-xs leading-5 text-[#748065]">
                    Every poll gets its own QR code. Share it on a screen, let people sign in with
                    their wallet, and follow the results together.
                  </p>
                </div>
              </div>
              <Link
                to="/dashboard/new"
                className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-[#3c5232]"
              >
                Start a conversation <ArrowUpRight className="size-4" />
              </Link>
            </CardContent>
          </Card>
          <section aria-labelledby="polls-title">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <h2 id="polls-title" className="text-lg font-semibold tracking-tight">
                Your community, in motion
              </h2>
              <span className="flex items-center gap-2 text-[11px] text-stone-400">
                <span
                  className={`size-1.5 rounded-full ${live.error ? "bg-amber-500" : live.updatedAt ? "bg-[#82a661]" : "bg-stone-300"}`}
                />
                {live.error
                  ? "Connection interrupted"
                  : live.updatedAt
                    ? "Updates every 5 seconds"
                    : "Solana Devnet"}
              </span>
            </div>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div
                className="flex gap-1 rounded-xl bg-[#ecefe7] p-1"
                role="group"
                aria-label="Poll filter"
              >
                <Button
                  variant="ghost"
                  aria-pressed={tab === "mine"}
                  className={`rounded-lg px-4 text-xs ${tab === "mine" ? "bg-white shadow-xs" : "text-stone-500"}`}
                  onClick={() => setTab("mine")}
                >
                  My polls <span className="ml-1 text-stone-400">{mine.length}</span>
                </Button>
                <Button
                  variant="ghost"
                  aria-pressed={tab === "all"}
                  className={`rounded-lg px-4 text-xs ${tab === "all" ? "bg-white shadow-xs" : "text-stone-500"}`}
                  onClick={() => setTab("all")}
                >
                  Community polls
                </Button>
              </div>
              <div className="relative w-full sm:w-60">
                <Search className="absolute top-3 left-3 size-3.5 text-stone-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search polls"
                  placeholder="Find a poll…"
                  className="h-10 rounded-xl border-stone-200 bg-white pl-9 text-xs"
                />
              </div>
            </div>
            {live.error && (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800"
              >
                {live.error}
                <Button variant="link" onClick={live.refresh}>
                  Try again
                </Button>
              </div>
            )}
            {live.loading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((key) => (
                  <div key={key} className="h-56 animate-pulse rounded-2xl bg-stone-200/50" />
                ))}
              </div>
            ) : displayed.length ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {displayed.map((poll) => (
                  <PollCard key={poll.address} poll={poll} />
                ))}
              </div>
            ) : (
              <Card
                className={`${panelClass} border border-dashed border-stone-300 bg-transparent shadow-none ring-0`}
              >
                <CardContent className="flex flex-col items-center px-6 py-14 text-center">
                  <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-[#edf0e7] text-[#84916d]">
                    <Sparkles className="size-6" />
                  </span>
                  <h3 className="text-base font-semibold">
                    {search
                      ? "No matching polls"
                      : tab === "mine"
                        ? "Good questions start here."
                        : "The conversation is just getting started."}
                  </h3>
                  <p className="mt-2 max-w-sm text-xs leading-6 text-stone-500">
                    {search
                      ? "Try a different search to find what you’re looking for."
                      : "Pick a topic, add a few options, and give everyone a say. Your first poll is a few clicks away."}
                  </p>
                  {!search && (
                    <Link
                      to="/dashboard/new"
                      className={`${actionClass} mt-6 inline-flex items-center bg-white text-stone-800 ring-1 ring-stone-200 hover:bg-stone-50`}
                    >
                      <Plus className="size-4" /> Create your first poll
                    </Link>
                  )}
                </CardContent>
              </Card>
            )}
          </section>
          <p className="mt-9 flex items-center justify-center gap-2 text-[10px] text-stone-400">
            <span className="size-1.5 rounded-full bg-[#9cae87]" /> Powered by Solana · Made for
            people with opinions.
          </p>
        </>
      )}
    </VotingShell>
  );
}

function PollCard({ poll }: { poll: Poll }) {
  const open = pollIsOpen(poll);
  const total = totalVotes(poll);
  return (
    <Link
      to="/polls/$pollId"
      params={{ pollId: poll.address }}
      className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#7b9460]"
    >
      <Card
        className={`${panelClass} h-full transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-[#becdad]`}
      >
        <CardContent className="flex h-full flex-col p-6">
          <div className="mb-5 flex items-center justify-between">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${open ? "bg-[#eef4e7] text-[#64814b]" : "bg-stone-100 text-stone-500"}`}
            >
              <span className={`size-1.5 rounded-full ${open ? "bg-[#86a665]" : "bg-stone-400"}`} />
              {open ? "Live" : "Closed"}
            </span>
            <ArrowUpRight className="size-4 text-stone-300 transition-colors group-hover:text-[#536c3d]" />
          </div>
          <h3 className="line-clamp-2 text-lg leading-7 font-semibold tracking-tight">
            {poll.title}
          </h3>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-stone-500">
            {poll.description || `${poll.options.length} options. One wallet, one vote.`}
          </p>
          <div className="mt-6 flex items-center gap-4 text-xs text-stone-500">
            <span className="flex items-center gap-1.5">
              <Vote className="size-3.5" /> {total.toLocaleString()}{" "}
              {total === 1 ? "vote" : "votes"}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock3 className="size-3.5" />
              {new Date(poll.closesAt * 1000).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-stone-100 pt-4 text-[10px] text-stone-400">
            <span>By {shortAddress(poll.creator)}</span>
            <span className="flex items-center gap-1.5 text-[#71845d]">
              Open poll <ArrowRight className="size-3" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
