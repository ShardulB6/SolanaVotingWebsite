// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  poll: {
    address: "9xQeWvG816bUx9EPfEZ5iKBFohrmtn8j47M2vB9cW9BB",
    creator: "11111111111111111111111111111111",
    nonce: new Uint8Array(16),
    createdAt: 100,
    closesAt: 4102444800,
    closed: false,
    deleted: false,
    title: "Which project gets your vote?",
    description: "Choose your favorite.",
    options: ["Project Cedar", "Project Maple"],
    votes: [3, 2],
  },
  receipt: null as { poll: string; voter: string; option: number } | null,
  receiptError: "",
  wallet: null as null | {
    name: string;
    accounts: { address: string }[];
    features: { "solana:signTransaction": object };
  },
  refresh: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock("../lib/auth", () => ({ signOut: vi.fn() }));
vi.mock("../lib/wallet", () => ({
  useSolanaWallets: () => (state.wallet ? [state.wallet] : []),
  signInWithWallet: vi.fn(),
}));
vi.mock("../lib/polls", () => ({
  programId: {},
  castVote: vi.fn(),
  closePoll: vi.fn(),
  deletePoll: vi.fn(),
  explorerUrl: (value: string) => `https://explorer.solana.com/address/${value}?cluster=devnet`,
  votingError: (error: Error) => error.message,
}));
vi.mock("../lib/use-polls", () => ({
  usePoll: () => ({ data: state.poll, error: "", loading: false, refresh: state.refresh }),
  useReceipt: () => ({
    data: state.receipt,
    error: state.receiptError,
    loading: false,
    refresh: vi.fn(),
  }),
}));

import { PollRoom } from "./poll-room";
import { deletePoll } from "../lib/polls";

describe("poll room", () => {
  beforeEach(() => {
    state.poll.votes = [3, 2];
    state.poll.closed = false;
    state.poll.deleted = false;
    state.poll.closesAt = 4102444800;
    state.wallet = null;
    state.refresh.mockReset();
    vi.mocked(deletePoll).mockReset();
    state.receipt = null;
    state.receiptError = "";
  });
  afterEach(cleanup);

  it("requires wallet sign-in to vote and keeps the mobile sign-in link on the poll", async () => {
    render(<PollRoom pollId={state.poll.address} user={null} />);
    expect(screen.queryByRole("button", { name: "Confirm vote" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Have your say." })).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByLabelText("Shareable poll link").getAttribute("value")).toContain(
        `/polls/${state.poll.address}`,
      ),
    );
    expect(screen.getByRole("link", { name: "Open in Phantom" }).getAttribute("href")).toContain(
      encodeURIComponent(window.location.href),
    );
  });

  it("updates counts while keeping the same QR code", async () => {
    const view = render(<PollRoom pollId={state.poll.address} user={null} />);
    await waitFor(() => expect(view.container.querySelector('svg[role="img"]')).toBeTruthy());
    const qr = view.container.querySelector('svg[role="img"]')!.outerHTML;
    expect(
      screen.getByRole("progressbar", { name: "Project Cedar" }).getAttribute("aria-valuenow"),
    ).toBe("60");
    state.poll = { ...state.poll, votes: [3, 7] };
    view.rerender(<PollRoom pollId={state.poll.address} user={null} />);
    expect(
      screen.getByRole("progressbar", { name: "Project Maple" }).getAttribute("aria-valuenow"),
    ).toBe("70");
    expect(view.container.querySelector('svg[role="img"]')!.outerHTML).toBe(qr);
  });

  it("restores an existing vote and does not offer another ballot", () => {
    state.receipt = { poll: state.poll.address, voter: state.poll.creator, option: 1 };
    render(<PollRoom pollId={state.poll.address} user={{ address: state.poll.creator }} />);
    expect(screen.getByRole("heading", { name: "Your voice is on chain." })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm vote" })).toBeNull();
    expect(screen.getByText("Project Maple", { selector: "span.font-medium" })).toBeTruthy();
  });

  it("does not permit submission when a previous-vote check fails", () => {
    state.receiptError = "RPC unavailable";
    render(<PollRoom pollId={state.poll.address} user={{ address: state.poll.creator }} />);
    expect(screen.getByRole("button", { name: "Confirm vote" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByRole("alert").textContent).toContain("RPC unavailable");
  });

  it("only offers early closure to the creator and requires confirmation", () => {
    const view = render(<PollRoom pollId={state.poll.address} user={{ address: "OtherWallet" }} />);
    expect(screen.queryByRole("button", { name: "End voting early" })).toBeNull();
    view.rerender(<PollRoom pollId={state.poll.address} user={{ address: state.poll.creator }} />);
    fireEvent.click(screen.getByRole("button", { name: "End voting early" }));
    expect(screen.getByText("End voting now? This can’t be undone.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep open" }));
    expect(screen.queryByRole("button", { name: "End voting" })).toBeNull();
  });

  it("only lets the creator choose deletion, including after voting ends", () => {
    const view = render(<PollRoom pollId={state.poll.address} user={null} />);
    expect(screen.queryByRole("button", { name: "Delete poll" })).toBeNull();
    view.rerender(<PollRoom pollId={state.poll.address} user={{ address: "OtherWallet" }} />);
    expect(screen.queryByRole("button", { name: "Delete poll" })).toBeNull();
    state.poll.closed = true;
    view.rerender(<PollRoom pollId={state.poll.address} user={{ address: state.poll.creator }} />);
    expect(screen.getByRole("button", { name: "Delete poll" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "End voting early" })).toBeNull();
  });

  it("allows the creator to delete an expired poll", () => {
    state.poll.closesAt = 1;
    render(<PollRoom pollId={state.poll.address} user={{ address: state.poll.creator }} />);
    expect(screen.getByRole("button", { name: "Delete poll" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "End voting early" })).toBeNull();
  });

  it("requires confirmation and lets the creator keep the poll", () => {
    render(<PollRoom pollId={state.poll.address} user={{ address: state.poll.creator }} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete poll" }));
    expect(screen.getByText(/Blockchain history stays public/)).toBeTruthy();
    expect(deletePoll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep poll" }));
    expect(screen.queryByRole("button", { name: "Delete permanently" })).toBeNull();
    expect(deletePoll).not.toHaveBeenCalled();
  });

  it("asks for the creator wallet when it is disconnected", async () => {
    render(<PollRoom pollId={state.poll.address} user={{ address: state.poll.creator }} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete poll" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Reconnect the creator’s wallet"),
    );
    expect(deletePoll).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: state.poll.title })).toBeTruthy();
  });

  it("waits for confirmation, prevents duplicate deletion, and removes the poll content", async () => {
    state.wallet = {
      name: "Test wallet",
      accounts: [{ address: state.poll.creator }],
      features: { "solana:signTransaction": {} },
    };
    let confirm!: () => void;
    vi.mocked(deletePoll).mockImplementation((_poll, _wallet, _creator, onSubmitted) => {
      onSubmitted("test-signature");
      return new Promise<string>((resolve) => {
        confirm = () => resolve("test-signature");
      });
    });
    render(<PollRoom pollId={state.poll.address} user={{ address: state.poll.creator }} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete poll" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    expect(deletePoll).toHaveBeenCalledWith(
      state.poll.address,
      state.wallet,
      state.poll.creator,
      expect.any(Function),
    );
    expect(screen.getByRole("button", { name: "Confirming…" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Keep poll" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("heading", { name: state.poll.title })).toBeTruthy();
    confirm();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Poll deleted" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Confirm vote" })).toBeNull();
    expect(screen.queryByLabelText("Shareable poll link")).toBeNull();
    expect(state.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the poll available if wallet approval or the transaction fails", async () => {
    state.wallet = {
      name: "Test wallet",
      accounts: [{ address: state.poll.creator }],
      features: { "solana:signTransaction": {} },
    };
    vi.mocked(deletePoll).mockRejectedValue(new Error("Transaction rejected"));
    render(<PollRoom pollId={state.poll.address} user={{ address: state.poll.creator }} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete poll" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Transaction rejected"),
    );
    expect(screen.getByRole("heading", { name: state.poll.title })).toBeTruthy();
    expect(state.refresh).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Delete permanently" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("hides results and voting if a deleted poll reaches the room", () => {
    state.poll.deleted = true;
    render(<PollRoom pollId={state.poll.address} user={{ address: state.poll.creator }} />);
    expect(screen.getByRole("heading", { name: "Poll deleted" })).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm vote" })).toBeNull();
  });

  it("keeps closed results visible and removes voting controls", () => {
    state.poll.closed = true;
    render(<PollRoom pollId={state.poll.address} user={{ address: state.poll.creator }} />);
    expect(screen.getByText("Final results")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm vote" })).toBeNull();
  });
});
