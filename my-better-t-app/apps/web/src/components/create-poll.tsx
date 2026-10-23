import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@my-better-t-app/ui/components/button";
import { Card, CardContent } from "@my-better-t-app/ui/components/card";
import { Input } from "@my-better-t-app/ui/components/input";
import { Label } from "@my-better-t-app/ui/components/label";
import { Textarea } from "@my-better-t-app/ui/components/textarea";
import {
  ArrowLeft,
  Check,
  CircleHelp,
  ListChecks,
  LoaderCircle,
  Plus,
  QrCode,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
import type { AuthUser } from "../lib/auth";
import { createPoll, votingError } from "../lib/polls";
import { validatePoll } from "../lib/polls-codec";
import { VotingShell, WalletGate, actionClass, panelClass } from "./voting-shell";

export function CreatePoll({ user }: { user: AuthUser | null }) {
  return (
    <VotingShell user={user} section="create">
      {user ? (
        <CreatePollForm />
      ) : (
        <div className="py-12">
          <WalletGate
            title="Start with your Solana wallet"
            description="Sign in to create your poll. You’ll choose the question and share a QR code with your community."
          />
        </div>
      )}
    </VotingShell>
  );
}

function CreatePollForm() {
  const navigate = useNavigate();
  const nonce = useRef<Uint8Array | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [duration, setDuration] = useState(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const input = {
      title: title.trim(),
      description: description.trim(),
      options: options.map((option) => option.trim()),
      closesAt: Math.floor(Date.now() / 1000) + duration * 3600,
    };
    try {
      validatePoll(input);
    } catch (cause) {
      setError(votingError(cause));
      return;
    }
    setBusy(true);
    try {
      nonce.current ??= crypto.getRandomValues(new Uint8Array(16));
      const address = await createPoll(input, nonce.current);
      await navigate({ to: "/polls/$pollId", params: { pollId: address } });
    } catch (cause) {
      setError(votingError(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link
        to="/dashboard"
        className="mb-6 inline-flex items-center gap-2 text-xs text-stone-500 hover:text-stone-800"
      >
        <ArrowLeft className="size-3.5" /> Back to dashboard
      </Link>
      <div className="mb-8">
        <p className="mb-2 text-xs font-medium text-[#71845d]">Make room for everyone’s opinion</p>
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">Ask your community.</h1>
        <p className="mt-3 text-sm text-stone-500">
          One question. A few choices. A conversation worth having.
        </p>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className={panelClass}>
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={submit} className="space-y-7">
              <fieldset disabled={busy} className="space-y-7 disabled:opacity-70">
                <div>
                  <Label htmlFor="poll-title" className="text-sm font-medium">
                    What would you like to ask?
                  </Label>
                  <Input
                    id="poll-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                    maxLength={100}
                    placeholder="Which project deserves the community award?"
                    className="mt-3 h-12 rounded-xl border-stone-200 px-4 text-sm"
                  />
                  <p className="mt-2 text-[11px] text-stone-400">
                    Keep it clear and specific. Up to 100 UTF-8 bytes.
                  </p>
                </div>
                <div>
                  <Label htmlFor="poll-description" className="text-sm font-medium">
                    A little context{" "}
                    <span className="ml-1 font-normal text-stone-400">(optional)</span>
                  </Label>
                  <Textarea
                    id="poll-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={280}
                    placeholder="Tell people what they’re voting for…"
                    className="mt-3 min-h-24 rounded-xl border-stone-200 p-4 text-sm"
                  />
                  <p className="mt-2 text-[11px] text-stone-400">
                    Up to 280 UTF-8 bytes. Questions, descriptions, and votes are public.
                  </p>
                </div>
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <Label className="text-sm font-medium" id="options-label">
                      The choices
                    </Label>
                    <span className="text-[11px] text-stone-400">2–6 options</span>
                  </div>
                  <div className="space-y-3" role="group" aria-labelledby="options-label">
                    {options.map((option, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#f0f3e9] text-xs font-medium text-[#768764]">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <Input
                          aria-label={`Option ${index + 1}`}
                          value={option}
                          required
                          maxLength={60}
                          placeholder={`Option ${index + 1}`}
                          onChange={(event) =>
                            setOptions((current) =>
                              current.map((value, i) => (i === index ? event.target.value : value)),
                            )
                          }
                          className="h-11 rounded-xl border-stone-200 px-4 text-sm"
                        />
                        {options.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 rounded-lg text-stone-400"
                            aria-label={`Remove option ${index + 1}`}
                            onClick={() =>
                              setOptions((current) => current.filter((_, i) => i !== index))
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {options.length < 6 && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-3 gap-2 rounded-lg text-xs text-[#5e744a]"
                      onClick={() => setOptions((current) => [...current, ""])}
                    >
                      <Plus className="size-3.5" /> Add another option
                    </Button>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-medium" id="duration-label">
                    How long should voting stay open?
                  </Label>
                  <div
                    className="mt-3 flex flex-wrap gap-2"
                    role="group"
                    aria-labelledby="duration-label"
                  >
                    {[
                      { hours: 1, label: "1 hour" },
                      { hours: 6, label: "6 hours" },
                      { hours: 24, label: "24 hours" },
                      { hours: 168, label: "7 days" },
                    ].map(({ hours, label }) => (
                      <Button
                        key={hours}
                        type="button"
                        variant="outline"
                        aria-pressed={duration === hours}
                        onClick={() => setDuration(hours)}
                        className={`h-10 rounded-xl px-4 text-xs ${duration === hours ? "border-[#809664] bg-[#eef3e6] text-[#4c6537]" : "border-stone-200 text-stone-500"}`}
                      >
                        {duration === hours && <Check className="mr-1 size-3" />}
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              </fieldset>
              <div className="border-t border-stone-100 pt-6">
                <Button
                  type="submit"
                  disabled={busy}
                  className={`${actionClass} w-full bg-[#263d2d] text-white hover:bg-[#354e3c] sm:w-auto`}
                >
                  {busy ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  {busy ? "Creating poll…" : "Create poll"}
                </Button>
                <p className="mt-3 text-[11px] leading-5 text-stone-400">
                  Creating polls and voting are free. Only publishing final results on Solana needs
                  Devnet SOL.
                </p>
              </div>
              {error && (
                <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-800">
                  {error}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card className={`${panelClass} bg-[#eaf0df] ring-[#dce5cc]`}>
            <CardContent className="p-6">
              <span className="mb-4 inline-flex rounded-xl bg-white/60 p-3 text-[#6f8654]">
                <QrCode className="size-6" />
              </span>
              <h2 className="text-base font-semibold">From question to QR.</h2>
              <p className="mt-3 text-xs leading-6 text-[#748065]">
                Once your poll is created, you’ll get a QR code to share. Put it on the big screen
                and let the room do the rest.
              </p>
            </CardContent>
          </Card>
          <div className="space-y-5 px-3 py-2">
            {[
              {
                icon: Wallet,
                title: "A wallet is all it takes",
                text: "People sign in with their own Solana wallet before voting.",
              },
              {
                icon: ListChecks,
                title: "One wallet, one vote",
                text: "Votes are final. The database prevents the same wallet from voting twice.",
              },
              {
                icon: ShieldCheck,
                title: "Public and verifiable",
                text: "Download signed ballots and verify the final results hash on Solana.",
              },
            ].map(({ icon: Icon, title: heading, text }) => (
              <div key={heading} className="flex gap-3">
                <Icon className="mt-0.5 size-4 shrink-0 text-[#84916e]" />
                <div>
                  <h3 className="text-xs font-medium">{heading}</h3>
                  <p className="mt-1 text-[11px] leading-5 text-stone-400">{text}</p>
                </div>
              </div>
            ))}
            <p className="flex items-start gap-2 border-t border-stone-200 pt-4 text-[10px] leading-5 text-stone-400">
              <CircleHelp className="mt-1 size-3 shrink-0" />
              You can end voting early, but you can’t change the question or choices after creating
              the poll.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
