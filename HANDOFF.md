# Poll deletion repair handoff

## Completion update — 2026-10-23 20:55 UTC

The user authorized completing the repair after the earlier handoff. **The fix is now pushed and deployed to the existing Devnet program. The Cloudflare tunnel remains off.**

- Source: commit `224c818` on `fix/live-poll-deletion`, published in [PR #6](https://github.com/ShardulB6/SolanaVotingWebsite/pull/6). The PR is open for review; it has not been merged into `main`.
- Program address remains `BsG7VkCXXtn1p7akwd4AHwRmscqR29XRFL8ZMp6veJRq`; existing poll links and accounts were preserved.
- Upgrade transaction: `3wvWCpJqH8ZbqcmqCJ7RGAzc6AbByiRYD5U4S5AL4pwWhgbiHBfPt9aUyUsvyPFZyo7ZM7yCHu4AU6HwTDqwU3Pe`.
- Deployed executable was verified byte-for-byte against the tested build, SHA-256 `d43fb65c38f2ec06ebb8592d39b269a6acda26bd2472ee2d1080ca588a6def6f`.
- The partial upload was resumed in paced batches and completed. The temporary uploader exited successfully; it is not a running service.
- Real Devnet verification passed for full-size legacy polls, previously closed polls, creator authorization, voting rejection after deletion, new poll creation/voting/deletion, and preservation of vote receipts.
- All nine original poll/receipt accounts remain byte-for-byte unchanged, including lamport balances. Only explicitly created verification polls were deleted.
- The local browser displayed the legacy test poll before deletion and automatically switched to **Poll unavailable** after confirmed deletion.
- All 34 web tests and 7 Rust tests pass. Production builds, TypeScript, lint, formatting, and the SBF build passed.
- Runtime report: `~/.cache/husky-voting-tunnel-t3-6c2657a3/deletion-upgrade-verification.json`; deployment receipt: `deletion-deployment-result.json` in the same directory.
- The local app remains on port 4000 in this worktree. No Cloudflare tunnel was restarted. The inactive sharing URL still needs updating when a new tunnel is explicitly requested.

The deployment and verification commands in the historical section below are now completed for this build. Do not rerun them merely because the old snapshot says they were pending. Review/merge PR #6 as appropriate alongside the user's other PR. The browser's creator confirmation controls are covered by component tests; a real browser wallet click-through of the entire creator flow was not performed.

## Historical handoff snapshot — superseded by the completion update

The remaining notes preserve the investigation and operator context as they stood before the user resumed work. Statements about uncommitted changes, missing deployment, or pending verification describe that earlier state.

Updated: October 23, 2026, 20:38 UTC.

## Current status and user direction

**The user asked to turn off the Cloudflare tunnel while preparing a new pull request. Keep it off. Do not resume deployment or restart the tunnel without a new instruction.**

The deletion repair is implemented and tested locally, but the upgraded executable has **not** reached Devnet. The local app runs the updated code; the deployed program still rejects `delete_poll`. End-to-end deletion remains unverified.

- Working branch: `fix/live-poll-deletion`.
- HEAD: `78d68fa43f702625607ac77fe5dbb4ea82c25a04`, the merge of [PR #4](https://github.com/ShardulB6/SolanaVotingWebsite/pull/4).
- The repair is **uncommitted**. No new PR was created or pushed for it.
- Workspace: `/home/shardulbhardwaj/.t3/worktrees/solanavotingwebsite/t3-e3df4bc2`.
- Local app: `http://127.0.0.1:4000`, responding HTTP 200 at handoff. Tracked parent PID: `715695`; recheck before acting on it.
- Cloudflare tunnel: stopped. No deployment CLI or temporary upload relay is running.
- The former URL, `https://structural-donors-humidity-still.trycloudflare.com`, is inactive. A new Quick Tunnel will require a new URL and updated sharing/allowed-host settings.

## Why deletion failed

The first implementation was merged in PR #4, but the tunnel was serving a separate, older worktree. That checkout lacked the delete controls, and its deployed program lacked the `delete_poll` instruction. A signed simulation reproduced:

```text
InstructionFallbackNotFound (Anchor error 101)
Fallback functions are not supported.
```

The initial implementation also appended a `deleted: bool` to the on-chain account. Existing poll accounts allocate 898 bytes; a maximum-sized legacy poll has no room for that extra byte. The repair removes that migration requirement.

## Changes ready for review

The program now uses a one-byte `PollStatus` enum in the original boolean's position, at offset 72:

- `0`: open, matching the legacy `closed = false` encoding.
- `1`: closed, matching the legacy `closed = true` encoding.
- `2`: deleted.

All subsequent offsets and the 898-byte allocation remain unchanged. Legacy polls need no migration. The browser decoder reads the same status byte and exposes the existing `closed` and `deleted` properties to the UI.

Deletion still requires the creator's signature and Anchor's `has_one = creator` constraint. It retains the poll account as a permanent marker, preserving results/receipts and preventing recreation at the same address. Calling `close_poll` on a deleted poll preserves its deleted state. Deleted polls cannot accept votes. Deletion removes a poll from the app; blockchain history remains public and rent is not reclaimed.

Changed tracked files, relative to the repository root:

- `my-better-t-app/solana/programs/husky-voting/src/lib.rs`: compatible status encoding, permanent deletion, and legacy-account tests.
- `my-better-t-app/apps/web/src/lib/polls-codec.ts`: compatible decoding and status validation.
- `my-better-t-app/apps/web/src/lib/polls.test.ts`: legacy closed-account decoding regression test and updated wire fixtures.
- `my-better-t-app/solana/Anchor.toml`: current deployed Devnet program address.
- `my-better-t-app/solana/README.md`: build, upgrade, compatibility, and verification instructions.
- `my-better-t-app/README.md`: deployment/runtime clarification.

New files:

- `my-better-t-app/solana/scripts/verify-deletion.mjs`: two-phase Devnet upgrade verification. Include this untracked script in the new PR.
- `HANDOFF.md`: this document.

The creator UI, transaction builder, dashboard filtering, deleted-link handling, and initial UI tests are already in merged PR #4; this repair builds on them.

## Validation completed

The following passed against the repair:

- 34 web tests: `pnpm exec vp test run` from `my-better-t-app`.
- 7 Rust tests: `cargo test --locked` from `my-better-t-app/solana`.
- Production browser/server builds and TypeScript: `pnpm exec vp run --filter web check-types`.
- Formatting/lint: `pnpm exec vp check` and `cargo fmt --check`.
- `git diff --check`.
- SBF executable build: `anchor build --no-idl -- --tools-version v1.52`.
- The updated app loaded through the tunnel before shutdown. A disposable browser wallet completed real signed wallet authentication against the app.

Rust coverage includes creator authorization, required signatures, deletion of open/closed/deleted polls, and maximum-sized legacy serialization without account growth. These are native tests, not validator integration tests.

**Not completed:** submitting and confirming a deletion transaction on Devnet, the verification script's `verify` phase, or clicking through a complete creator deletion flow in the browser. Wallet sign-in alone does not verify deletion.

## Exact Devnet state at handoff

- Network: Devnet, `https://api.devnet.solana.com`.
- Program: `BsG7VkCXXtn1p7akwd4AHwRmscqR29XRFL8ZMp6veJRq`.
- Program data: `EwhCMgytan8kKwbdQm1PtpYBXnKmirgaYuFmgSAQGL63`.
- Upgrade authority: `CHTGt44ZTyuxbsosrC1SARkZTfKEEQdG97mFg8CtxXxo`.
- Default CLI signer file: `~/.config/solana/id.json`. It is private; never commit or print its contents.
- Original executable: 264,264 bytes.
- New local executable: 264,632 bytes, at `my-better-t-app/solana/target/deploy/husky_voting.so`.
- New executable SHA-256: `d43fb65c38f2ec06ebb8592d39b269a6acda26bd2472ee2d1080ca588a6def6f`.

The first upgrade attempt failed because automatic extension requested only 368 additional bytes. The cluster required a minimum extension of 10,240 bytes. An explicit 10,240-byte program-storage extension succeeded; the allocation is now 274,504 bytes. **Do not extend again just for this build.** Poll accounts were not resized.

The subsequent upload encountered repeated HTTP 429 responses. A temporary local relay spaced requests and honored `Retry-After`, but the upload was not completed. The relay at `127.0.0.1:4889` is now stopped.

A read-only handoff audit confirmed:

- The current deployed allocation starts with the exact original executable and has zero-filled extension space. It does **not** match the new local executable.
- `lastDeploySlot` is now `514366352`, but that changed during storage extension. It is **not proof of a successful code upgrade**.
- A signed simulation of deletion against the full-size legacy test poll still returns error 101. No deletion was submitted during this audit.
- All nine original poll/receipt accounts match their snapshots byte-for-byte, including lamport balances.
- The upload buffer account still exists. It may contain a partial upload; its completeness has not been verified.

Upload buffer public address: `DiMsfCxzq9ewxkL4QsCg3oxvEyBKcXxaepC8Ngde4pzd`.

## Runtime files and preserved worktrees

Runtime directory:

```text
/home/shardulbhardwaj/.cache/husky-voting-tunnel-t3-6c2657a3
```

Useful artifacts there:

- `state.json`: active checkout path, local app PID/port, program address, stopped tunnel state, and former URL.
- `app.log` and archived app/tunnel logs.
- `accounts-before-deletion-fix.json`: original public account snapshot.
- `deletion-upgrade-verification.json`: public verification report and pre-upgrade test poll addresses.
- `husky-voting-before-deletion.so`: original deployed executable backup.
- `husky-voting-handoff-audit.so`: deployed allocation downloaded during the handoff audit.
- `deletion-upgrade-buffer.json`: **private upload-buffer keypair**. Keep it outside Git and preserve it for a retry or later authorized cleanup.
- `deletion-upload-proxy.log`: upload progress and rate-limit errors.

The stopped relay's temporary source is `/tmp/husky-devnet-upload-proxy.mjs`. It is not a repository file or a production service. The former relay PID file was removed.

The app server was switched to this repair workspace without restarting the tunnel. Its ignored `my-better-t-app/apps/web/.env` was copied from the prior running checkout, preserving the session secret and public network configuration. Do not commit that file. Its sharing URL and allowed-host environment still refer to the former tunnel hostname.

The previous checkout remains untouched:

```text
/home/shardulbhardwaj/.t3/worktrees/solanavotingwebsite/t3-6c2657a3
```

It has separate uncommitted changes to its README files, Anchor configuration, Rust program ID, and `solana/scripts/verify-devnet.mjs`. Those changes were not merged into this branch or overwritten. Coordinate before consolidating the two worktrees.

## Resume steps after the user authorizes them

1. Review and commit the repair files on `fix/live-poll-deletion` for the user's new PR. Check `git status`; do not assume the untracked verification script is included automatically. Repository UI instructions require reusing the shadcn components in `packages/ui` if further UI changes are made.
2. Recheck the deployed binary/program state and buffer before retrying. Do not infer success solely from a slot number or an absent CLI process.
3. Rebuild if source changes. Toolchain used successfully: Anchor 0.32.1, Solana/Agave CLI 2.3.0, SBF platform tools v1.52, Node 24. Use `--no-idl`; the browser uses its own codec, and the IDL generator has a known `proc_macro2::Span::unwrap` tooling failure.
4. Resume the upgrade at the **same program address**, retaining the existing authority and buffer. The allocation is already large enough. The previous direct public-RPC upload hit rate limits, so resolve throttling or use an authorized reliable Devnet RPC before retrying. A reference command, from `my-better-t-app/solana`, is:

   ```bash
   solana program deploy target/deploy/husky_voting.so \
     --program-id BsG7VkCXXtn1p7akwd4AHwRmscqR29XRFL8ZMp6veJRq \
     --buffer "$HOME/.cache/husky-voting-tunnel-t3-6c2657a3/deletion-upgrade-buffer.json" \
     --url devnet --use-rpc --no-auto-extend --max-sign-attempts 5 --output json
   ```

5. After a confirmed upgrade, compare deployed bytes against the new executable, allowing for zero-filled allocation padding. Then run the pending verification from `my-better-t-app/solana`:

   ```bash
   node --experimental-transform-types scripts/verify-deletion.mjs verify \
     BsG7VkCXXtn1p7akwd4AHwRmscqR29XRFL8ZMp6veJRq \
     "$HOME/.cache/husky-voting-tunnel-t3-6c2657a3/deletion-upgrade-verification.json"
   ```

   The `prepare` phase already ran; do not rerun it against the same report. Its test polls are `9zSdTgJ8696ejwgi9zs2BaTp5hX5Hjbyxbs4kzEpXrug` (full-size legacy) and `9gP7Ui7NxAqfLFzEi55QcypyLJLZDmmPC7BGtjJvPUwK` (legacy closed). The report currently records only preparation as passed. Verification submits Devnet transactions and deletes only those test polls plus a new script-created poll. If original accounts have legitimately changed since the snapshot, review those differences before interpreting the strict snapshot check.

6. Verify a complete creator deletion flow through the updated app, including confirmation, wallet approval, dashboard removal, unavailable shared links, and rejection of another wallet's deletion attempt. Existing polls must remain readable.
7. Restart a tunnel only when requested. Keep it pointed at the tested checkout's local server, update `VITE_PUBLIC_APP_URL` and `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` for the newly assigned hostname, and check the public page and QR links.

The disposable browser test wallet was `2DFG95ccb84dLC3JhDxDTz9aU3KGdAHF7qC9fCwtxTmU`. Its funding command failed, and its balance was confirmed as zero at handoff. Its ephemeral signing key lived only in the agent-owned browser tab; no end-to-end deletion depends on preserving that tab.
