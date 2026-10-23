# HuskyVote Solana program

This Anchor program backs the web dashboard. Hosting and network deployment are separate decisions; nothing here deploys automatically. The web client currently targets **Solana Devnet**.

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

Install Anchor CLI 0.32.1, Solana/Agave CLI 2.3.0, and SBF platform tools v1.52 (the locked dependencies require Rust 2024 support). See the [Anchor release instructions](https://www.anchor-lang.com/docs/updates/release-notes/0-32-1).

From this directory:

```bash
anchor build --no-idl -- --tools-version v1.52
# Upgrade the configured Devnet program with its existing deployment authority:
solana program deploy target/deploy/husky_voting.so \
  --program-id BsG7VkCXXtn1p7akwd4AHwRmscqR29XRFL8ZMp6veJRq --url devnet --use-rpc
```

The checked-in program address is the current Devnet deployment. Upgrades require its deployment authority; `--program-id` accepts the existing address without creating a new program. Keep deployment keys private; `target/` is ignored. For a separate new deployment, generate its keypair and explicitly synchronize `declare_id!` and `Anchor.toml` with that address.

If the executable has outgrown the program allocation, extend it by at least 10,240 bytes before deploying with `--no-auto-extend`. The installed CLI can otherwise request an extension smaller than the cluster permits. This changes executable storage, not poll account sizes.

The browser uses its own codecs. `--no-idl` avoids the current IDL generator's `proc_macro2::Span::unwrap` tooling error.

Before real use, run validator integration tests for create, vote, duplicate vote, expired poll, invalid option, unauthorized closure/deletion, and voting after deletion, then deploy the executable to the selected network. The running website must serve this same client version; merging a branch does not update an app running from a different worktree. For matching website configuration, follow the [hosting guide](../../README.md#host-the-project).

After a Devnet deployment, add the program address to `apps/web/.env`:

```dotenv
VITE_SOLANA_PROGRAM_ID=BsG7VkCXXtn1p7akwd4AHwRmscqR29XRFL8ZMp6veJRq
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
```

The deletion feature adds the `delete_poll` instruction. It reuses the original closed/open byte at offset 72: `0` means open, `1` means closed, and `2` means deleted. All later offsets and the 898-byte allocation stay unchanged. Existing open and closed polls, including maximum-sized polls, need no migration. Build and upgrade the same program address, then update the web client; updating only the website cannot add a missing program instruction.

Restart the dev server or rebuild the web app. These values are public build-time settings. An RPC URL used here must be safe to expose to browsers; do not include private credentials.

Wallets need Devnet SOL for transaction fees and the rent-exempt balances of poll/receipt accounts. There is no fee sponsorship in this version. Mainnet support would need an explicit client network/Explorer configuration change and a separate program deployment.

## Verify deletion across an upgrade

With Node 24, installed web dependencies, and a funded Devnet CLI wallet, run this before upgrading the original program:

```bash
node --experimental-transform-types scripts/verify-deletion.mjs prepare \
  BsG7VkCXXtn1p7akwd4AHwRmscqR29XRFL8ZMp6veJRq /tmp/deletion-report.json
```

This snapshots existing public poll/receipt accounts and creates two clearly labeled test polls, including a maximum-sized legacy account. After upgrading, run:

```bash
node --experimental-transform-types scripts/verify-deletion.mjs verify \
  BsG7VkCXXtn1p7akwd4AHwRmscqR29XRFL8ZMp6veJRq /tmp/deletion-report.json
```

Verification deletes only the script's test polls, checks that another wallet cannot delete them, checks voting rejection and permanent deletion after closure, and creates/votes/deletes a new poll while preserving its receipt. It confirms original accounts remain byte-for-byte unchanged. It temporarily funds a second wallet with 0.02 Devnet SOL and returns its unspent balance. The report contains public addresses, account data, and transaction signatures; no private keys.

## QR links and phones

Polls live at `/polls/<poll-account-address>`. The QR encodes this stable URL, never changing counts or a desktop session. The results beside it refresh as votes arrive.

By default, sharing uses the current site's origin. Optionally set `VITE_PUBLIC_APP_URL` to the phone-reachable HTTPS origin that serves the same app and program configuration. Localhost on a phone points to the phone itself, so a localhost QR cannot reach a desktop dev server.

People scan with their camera, open the poll, and sign in using a Solana wallet. Wallet Standard works in wallet-enabled browsers. If no wallet is detected, **Open in Phantom** opens that same poll in Phantom's browser; the app does not require a phone browser extension. After signing in, voters stay on the poll and approve their voting transaction separately.

The dashboard and results can be built and reviewed without deploying anything. Creation and voting remain disabled or unavailable until a program is configured; there are no local-only or simulated votes in the product.
