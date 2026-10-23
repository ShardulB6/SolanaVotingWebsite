# Free voting with D1, Drizzle, and Solana

The web app now stores polls and signed ballots in Cloudflare D1 (SQLite), using Drizzle for the schema, queries, and migrations. Creating a poll and voting require **no SOL**. After voting ends, the creator can publish a SHA-256 commitment with one creator-paid Solana Devnet Memo transaction. No custom program deployment or permanent per-voter Solana accounts are required.

## Voting and integrity

1. Sign in with the existing wallet challenge and encrypted session cookie.
2. The server issues a five-minute ballot challenge containing the site's origin, poll ID, question, wallet, option, choice, random nonce, and expiry.
3. The wallet signs that message with `solana:signMessage`. The server verifies its exact bytes and Ed25519 signature against the authenticated wallet.
4. A single SQL insert checks the challenge, deadline, and open/deleted state inside the database. The composite primary key `(poll, voter)` permits only one ballot, even when requests arrive simultaneously. Receipts retain the signed message and signature, and voters can download them.
5. Closing/deleting requires the authenticated creator's session. There are no ballot edit/delete or poll-reopen APIs. Deletion retains the database tombstone and ballots, but removes the poll from listings and prevents further votes and exports. An existing Solana transaction remains public.
6. After closure or expiry, the final record includes the question, choices, counts, and all signed ballots sorted by wallet. The client checks every signature and recomputes its canonical SHA-256 hash before requesting the creator's transaction signature.
7. The Memo is `HuskyVote results v1\npoll:<id>\nsha256:<digest>`. The backend records the publication only after verifying a finalized, successful Devnet transaction signed by the creator with the exact Memo. A saved anchor cannot be overwritten through the app. Pending transaction details survive reloads; confirming/recording can be retried without sending another transaction. Failed or dropped transactions can be retried after expiry.

**Trust boundary:** D1 enforces duplicate-vote prevention. Solana commits to the published record; it does not validate individual votes, independently prove completeness, or prevent the server operator from omitting a ballot before publication. Wallet signatures prevent fabricating another wallet's ballot. Downloads let attendees retain their receipt and compare it with the final record. A person can still use multiple wallets; there is no attendee identity verification or allowlist. Questions, wallet addresses, choices, and signatures are public.

## Cloudflare deployment

`packages/infra/alchemy.run.ts` declares a D1 database, points it at the committed Drizzle migrations, and binds it to the Worker as `DB`. Alchemy applies migrations during deployment and outputs the database name and ID alongside the web URL. Keep `AUTH_SESSION_SECRET` configured as before. The Worker uses the D1 binding directly, with no Cloudflare API token in the app.

Run the existing deployment command from the workspace root when ready:

```sh
pnpm deploy
```

This PR does not deploy anything or create a billable resource. Once a database is managed by Alchemy, let Alchemy own its migrations; do not alternate migration tools against that database.

## Node development and Cloudflare Tunnel

A tunnel exposes the Node dev server; it does **not** supply a D1 binding. Choose one of these development setups:

- Leave Cloudflare credentials unset: `pnpm dev:web` uses `.data/huskyvote.sqlite`, applies the committed Drizzle migrations automatically, and persists across restarts. Node 24.10+ is required for its SQLite API. This fallback is stripped from the production Worker bundle.
- To use hosted D1 while tunneling the Node server, put `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, and `CLOUDFLARE_D1_TOKEN` in `apps/web/.env`. All three are required. Use an account-scoped D1 Read + Write token; it stays server-side. Drizzle queries execute through Cloudflare's D1 HTTP API. If D1 fails, the app reports an error and does not switch to local storage. Prefer a separate development database to avoid mixing test ballots with an event.

For a standalone D1 database created in the Cloudflare dashboard (not managed by Alchemy), apply the committed migrations once after setting those credentials:

```sh
cd apps/web
pnpm db:migrate:remote
```

For an Alchemy-managed D1 database, deploy the migrations through Alchemy instead. For the first deployment, use its returned database ID to configure a tunneled Node server against the same database if needed. There is no automatic data transfer between local SQLite, a manually created D1 database, and an Alchemy-created D1 database.

Expose the dev port with your existing tunnel. Set `VITE_PUBLIC_APP_URL` to the stable HTTPS tunnel origin for QR links, and open the site at that origin on all voting devices. Never put API tokens in a `VITE_` variable. Use a stable origin for sign-in and ballot challenges.

`VITE_SOLANA_RPC_URL` still selects the public Devnet RPC. The UI and Explorer links target Devnet. `VITE_SOLANA_PROGRAM_ID` is no longer used. The older Anchor program and codecs remain in the repository as a separate on-chain implementation; its accounts are not automatically imported into D1. Older on-chain poll URLs show unavailable in this client.

## Independent verification

After publication, download the results JSON and retain it. The app's **Verify results and signatures** button checks the record against the finalized transaction. To check a downloaded file without relying on the voting server, use Node 24.10+ from `apps/web`:

```sh
pnpm results:verify /path/to/huskyvote-results.json
# Optional second argument: your Devnet archival RPC URL.
```

The verifier checks signatures, duplicate wallets, counts, canonical SHA-256, creator signature, and Memo contents. Public RPCs may prune old transaction history; use an archival Devnet RPC when the original transaction is no longer returned. The downloaded JSON is needed because the Memo contains a hash, not the ballots themselves.

## Schema changes and checks

Edit `src/db/schema.ts`, then run `pnpm --filter web db:generate` from the workspace root. Commit the SQL migration and Drizzle metadata together. Local development applies migrations on startup; hosted migrations use the deployment route described above.

```sh
pnpm exec vp test
pnpm check
```

The tests include real Ed25519 ballots, simultaneous duplicate submissions, deadlines, close/delete races, result tampering, creator authorization, publication retries, and a Miniflare D1 test that submits 60 requests from 30 wallets and verifies exactly 30 saved votes. Solana RPC publication checks are mocked; a funded creator wallet is needed for a live Devnet publication.
