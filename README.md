# HuskyVote · Solana Voting Website

HuskyVote is a community polling app for Hacktoberfest Hack Day Toronto x HuskyHack. Organizers create public polls, share a link or QR code, and present live results. Participants sign in with a Solana wallet and submit votes as transactions on **Solana Devnet**.

## Features

- Sign In With Solana with server-side signature verification and encrypted sessions.
- Public polls with 2–6 choices and a deadline within the next 30 days.
- Personal and community poll listings, question search, shareable poll pages, QR codes, and presentation mode.
- Confirmed on-chain results refreshed every five seconds, with submitted votes restored from on-chain receipts after reload.
- One final vote per wallet per poll, with creator-only early closure and permanent deletion markers.

Signing in only signs a message; creating a poll or voting requires a separate wallet-approved transaction and Devnet SOL. Polls, votes, and results are public. One vote per wallet does not establish one vote per person. Deleting a poll removes it from the app and stops voting, but retains its blockchain history and accounts.

The repository includes both the website and the Rust/Anchor voting program. The checked-in program address is a development placeholder; voting needs a deployed program and matching website configuration. You can run and review the website before deploying either part.

## How it works

The frontend uses React, TanStack Start, TanStack Router, TypeScript, Tailwind CSS, and shared shadcn/ui components. Server functions verify wallet signatures and create a 24-hour encrypted, HttpOnly session cookie. The browser sends signed poll transactions and reads results through a public Solana RPC endpoint. The Anchor program enforces voting rules independently of the website session. No application database is required.

Vite+ runs development, builds, and checks. The included Alchemy infrastructure targets Cloudflare Workers for the fullstack website and static assets.

## Run locally

Use Node.js 24.11 or newer in the Node 24 release line and the pinned `pnpm@12.15.0` package manager. Rust, Anchor, and the Solana CLI are only needed when working on the on-chain program.

```bash
git clone https://github.com/ShardulB6/SolanaVotingWebsite.git
cd SolanaVotingWebsite/my-better-t-app
pnpm install --frozen-lockfile
node --input-type=module -e 'import { randomBytes } from "node:crypto"; import { writeFileSync } from "node:fs"; writeFileSync("apps/web/.env", "AUTH_SESSION_SECRET=" + randomBytes(32).toString("hex") + "\n", { flag: "wx", mode: 0o600 })'
pnpm run dev:web
```

Open [http://localhost:3001](http://localhost:3001) in a wallet-enabled browser. If `apps/web/.env` already exists, add a random `AUTH_SESSION_SECRET` of at least 32 characters to it instead of running the file-creation command. Wallet sign-in works without SOL; voting requires the Devnet setup below.

See the [application README](./my-better-t-app/README.md) for authentication details, tests, and UI customization.

## Host the project

There are two deployments: the voting program on Solana Devnet and the fullstack website on Cloudflare Workers. Publishing the website alone does not deploy or enable the voting program. These are operator instructions; the repository does not automatically publish either component.

### 1. Deploy the voting program to Devnet

Install Rust, Anchor CLI **0.32.1**, and a compatible Solana/Agave toolchain. Anchor's [0.32.1 release notes](https://www.anchor-lang.com/docs/updates/release-notes/0-32-1) recommend Solana **2.3.0**. Set up a deployment wallet at the path in `solana/Anchor.toml` (`~/.config/solana/id.json`) and fund it with Devnet SOL. Keep that wallet and the generated program keypair private.

From `my-better-t-app/`:

```bash
cd solana
cargo test --locked
cargo fmt --check
anchor build
anchor keys sync
anchor build
anchor keys list
```

The first build generates `target/deploy/husky_voting-keypair.json`. Syncing updates the Rust program ID and `Anchor.toml`; the second build embeds that address. Before using the program for an event, run the validator integration scenarios in the [program README](./my-better-t-app/solana/README.md#program-build-and-configuration). The existing native tests do not exercise complete validator transactions.

Deploy and verify the program, replacing `YOUR_PROGRAM_ID` with the address printed by `anchor keys list`:

```bash
anchor deploy --provider.cluster devnet
solana program show YOUR_PROGRAM_ID --url devnet
cd ..
```

Use that address in the website settings below. Deploy the current program version, including poll deletion; an older deployment needs an account migration or a fresh program address. The client fixes wallet transactions and Explorer links to Devnet, so changing only the RPC URL does not add Mainnet support.

### 2. Configure production settings

From `my-better-t-app/`, create a separate production session secret in the infrastructure package's ignored environment file:

```bash
node --input-type=module -e 'import { randomBytes } from "node:crypto"; import { writeFileSync } from "node:fs"; writeFileSync("packages/infra/.env", "NODE_ENV=production\nAUTH_SESSION_SECRET=" + randomBytes(32).toString("hex") + "\n", { flag: "wx", mode: 0o600 })'
```

If the file already exists, add the settings manually. Preserve the production secret between releases; rotating it signs existing users out. The infrastructure schema imports the session settings, and `alchemy.run.ts` binds `AUTH_SESSION_SECRET` as a secret Worker environment variable and sets `NODE_ENV=production`.

Create `apps/web/.env.production.local` with the public production build settings:

```dotenv
VITE_SOLANA_PROGRAM_ID=YOUR_PROGRAM_ID
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
# Optional: set this to the final HTTPS site origin once you have one.
# VITE_PUBLIC_APP_URL=https://vote.example.com
```

All `VITE_` values are embedded in browser assets. Use an RPC endpoint that permits browser access and the account queries the app needs; do not include private credentials in its URL. Participants need Devnet SOL for transaction fees and account rent.

Leave `VITE_PUBLIC_APP_URL` unset to share links using the current website origin, or set it to an HTTPS origin serving this same app and program. A localhost QR link cannot reach your desktop from a phone. Keep secrets in ignored files or your deployment environment.

### 3. Publish the website to Cloudflare

Use a Cloudflare account with Workers enabled. From `my-better-t-app/`, connect the account through the pinned Alchemy v2 CLI, then deploy a stable `prod` stage:

```bash
pnpm --filter @my-better-t-app/infra exec alchemy profile
pnpm --filter @my-better-t-app/infra exec alchemy deploy --stage prod
```

In the profile screen, add Cloudflare and complete OAuth or API-token setup. Alchemy v2 uses `profile` for account setup; see its [profile documentation](https://alchemy.run/environments/profiles/). The stack in [`packages/infra/alchemy.run.ts`](./my-better-t-app/packages/infra/alchemy.run.ts) builds the TanStack Start app, uploads its server and assets to Workers, and uses `Cloudflare.state()` for remote deployment state. The deploy output includes a `web` HTTPS URL.

For CI, provide `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as CI secrets, supply the production settings above, install with the lockfile, and run the deployment command with `--yes`. The repository does not include an automatic deployment workflow.

Use the same Cloudflare account and `--stage prod` for later releases. After changing public build settings, force a rebuild and redeploy so a source cache cannot retain the old browser configuration:

```bash
pnpm --filter @my-better-t-app/infra exec alchemy deploy --stage prod --force
```

The app needs server functions for wallet verification and sessions; uploading only client assets to a static host is insufficient. Other providers need their own TanStack Start server adapter and runtime configuration. Production must use HTTPS for the secure session cookie.

### 4. Check the hosted app

Open the deployed HTTPS URL, sign in, and reload to confirm the session persists. With wallets set to Devnet and funded with Devnet SOL, create a poll, open its shared link on another device, submit a vote from a second wallet, and confirm results refresh and the vote stays submitted after reload. Check creator-only closure and deletion, sign-out, and direct navigation to `/dashboard` and `/polls/<address>`.

If the dashboard shows a setup notice, check `VITE_SOLANA_PROGRAM_ID` and rebuild. If transactions fail, check the program deployment, wallet network, Devnet balance, and browser RPC access. If sign-in fails in production, check the Worker session-secret binding and HTTPS origin.

## Repository guide

- [`my-better-t-app/apps/web/`](./my-better-t-app/apps/web/): routes, wallet authentication, dashboard, and poll pages.
- [`my-better-t-app/packages/ui/`](./my-better-t-app/packages/ui/): shared components and styles.
- [`my-better-t-app/packages/infra/`](./my-better-t-app/packages/infra/): Alchemy and Cloudflare deployment configuration.
- [`my-better-t-app/solana/`](./my-better-t-app/solana/): Anchor program and program-specific setup notes.

## Development checks

From the repository root:

```bash
cd my-better-t-app
pnpm run check
pnpm exec vp test apps/web/src/lib/session.test.ts apps/web/src/lib/polls.test.ts apps/web/src/lib/polls-codec.test.ts apps/web/src/lib/use-polls.test.tsx apps/web/src/components/poll-room.test.tsx
```

## License and credits

The source code is licensed under the [MIT License](./LICENSE). The license preserves the copyright notice for UI code adapted from shadcn/ui. Third-party artwork and dependencies retain their respective licenses.

Created in [T3 Code](https://t3.codes), with an application scaffold from [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack).
