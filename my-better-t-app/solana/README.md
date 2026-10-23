# HuskyVote Solana program

**Legacy on-chain implementation:** the current web dashboard uses [D1 + Drizzle and signed ballots](../apps/web/HYBRID_VOTING.md), with final results published through Solana’s Memo program. It does not call this Anchor program or require its deployment. Existing accounts are not migrated to D1. The documentation below describes this separate implementation.

This Anchor program previously backed the web dashboard. Hosting and network deployment are separate decisions; nothing here deploys automatically. The web client currently targets **Solana Devnet**.

## Behavior

- Any wallet can create a public poll with 2–6 choices and a deadline in the next 30 days.
- The creator signs the creation transaction and funds the poll account.
- Each voter signs a transaction and funds a permanent vote receipt. A receipt PDA uses the poll and voter address as seeds. Anchor's `init` constraint prevents repeat votes, including simultaneous submissions.
- The receipt creation and counter increment happen atomically. Invalid choices, closed polls, and expired polls reject the entire transaction.
- Only the creator can end a poll early or delete it at any time, including after its deadline. Both actions require the creator's wallet signature, enforced by the program.
- Deletion is permanent: it closes voting and sets an on-chain deletion marker. Deleted polls disappear from all dashboard listings and their shared links show an unavailable message. The retained account prevents recreation at the same address with reset results. Blockchain history and vote receipts remain public; deletion does not reclaim account rent.
- Questions and choices cannot be edited; polls cannot be reopened and receipts cannot be closed.
- This is one **wallet**, one vote. It does not establish attendee identity or stop someone from using several wallets. There is no attendee allowlist in this version.
- All poll details, votes, and results are public. The app reads confirmed account data every five seconds.

The browser's signed-in session controls access to the creation and voting UI. The program independently requires wallet signatures and enforces voting rules, including for callers outside the website.

## Local checks

With Rust installed:

```bash
cd solana
cargo test --locked
cargo fmt --check
```

These native tests exercise deletion account constraints and the handler (creator signatures, unauthorized deletion, and deletion of open/ended polls), but are not validator integration tests. The web tests also check Anchor discriminators, decoding limits, transaction packet size, stable QR links, wallet login requirements, receipt restoration, and live refresh recovery.

## Program build and configuration

To prepare a Solana executable, install Anchor CLI 0.32.1 and its compatible Solana/Agave SBF toolchain. See the [Anchor release instructions](https://www.anchor-lang.com/docs/updates/release-notes/0-32-1).

From this directory:

```bash
anchor build
anchor keys sync
anchor build
```

The first build creates a local program keypair. `anchor keys sync` updates `declare_id!` and `Anchor.toml` to that address. The checked-in address is a development placeholder, not a deployed voting program. Keep the generated keypair and deployment authority private; `target/` is ignored.

Before real use, run validator integration tests for create, vote, duplicate vote, expired poll, invalid option, unauthorized closure/deletion, and voting after deletion, then deploy the executable to the selected network. Actual network deployment is intentionally left for a later step.

After a Devnet deployment, add the program address to `apps/web/.env`:

```dotenv
VITE_SOLANA_PROGRAM_ID=<the deployed program address>
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
```

The deletion feature adds a `deleted` boolean to the poll account layout and a `delete_poll` instruction. Build and deploy this program version before using the updated client. Existing deployments need an explicit account migration or a fresh program deployment; changing only the website does not add deletion to an older deployed program.

Restart the dev server or rebuild the web app. These values are public build-time settings. An RPC URL used here must be safe to expose to browsers; do not include private credentials.

Wallets need Devnet SOL for transaction fees and the rent-exempt balances of poll/receipt accounts. There is no fee sponsorship in this version. Mainnet support would need an explicit client network/Explorer configuration change and a separate program deployment.

## QR links and phones

Polls live at `/polls/<poll-account-address>`. The QR encodes this stable URL, never changing counts or a desktop session. The results beside it refresh as votes arrive.

By default, sharing uses the current site's origin. Optionally set `VITE_PUBLIC_APP_URL` to the phone-reachable HTTPS origin that serves the same app and program configuration. Localhost on a phone points to the phone itself, so a localhost QR cannot reach a desktop dev server.

People scan with their camera, open the poll, and sign in using a Solana wallet. Wallet Standard works in wallet-enabled browsers. If no wallet is detected, **Open in Phantom** opens that same poll in Phantom's browser; the app does not require a phone browser extension. After signing in, voters stay on the poll and approve their voting transaction separately.

The dashboard and results can be built and reviewed without deploying anything. Creation and voting remain disabled or unavailable until a program is configured; there are no local-only or simulated votes in the product.
