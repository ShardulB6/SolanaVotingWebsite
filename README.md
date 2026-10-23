# HuskyVote · Solana Voting Website

HuskyVote is a community polling app for Hacktoberfest Hack Day Toronto x HuskyHack. Organizers create public polls, share a link or QR code, and present live results. Participants sign in with a Solana wallet and vote by signing a free message. After voting ends, the creator can publish a results hash on **Solana Devnet**.

## Features

- Sign In With Solana with server-side signature verification and encrypted sessions.
- Public polls with 2–6 choices and a deadline within the next 30 days.
- Personal and community poll listings, question search, shareable poll pages, QR codes, and presentation mode.
- Live results refreshed every five seconds, with signed ballot receipts restored after reload and available to download.
- One final vote per wallet per poll, with creator-only early closure and permanent deletion markers.

Signing in and voting sign messages; creating a poll and voting require no SOL. Polls and signed ballots are stored in Cloudflare D1 through Drizzle, with local SQLite available for Node development. Only publishing final results requires a creator-paid Solana transaction. Polls, votes, and results are public. One vote per wallet does not establish one vote per person. Deletion removes a poll from the app and stops voting while retaining its database marker and ballots; any published Solana transaction remains public.

The repository also retains the earlier Rust/Anchor voting program as a separate implementation. The current website does not call it or require a program deployment. Existing on-chain polls are not automatically migrated into D1; older poll URLs are unavailable in this client.

## How it works

The frontend uses React, TanStack Start, TanStack Router, TypeScript, Tailwind CSS, and shared shadcn/ui components. Server functions verify wallet signatures and create a 24-hour encrypted, HttpOnly session cookie. The server verifies wallet-signed ballots and stores them through Drizzle. A database primary key and conditional insert enforce one final vote per wallet, deadlines, and closed/deleted state. After closure or expiry, the creator can publish a canonical results hash through the Solana Memo program. Anyone can download and verify the signed results record against that transaction. Solana commits to the published record; it does not independently enforce individual votes or prove that every submitted ballot was included.

Vite+ runs development, builds, and checks. The current shared site uses **Cloudflare Tunnel** to expose the website running on the host computer through a public HTTPS URL. The included Alchemy infrastructure also supports deploying the fullstack website and static assets to Cloudflare Workers.

## Run locally

Use Node.js 24.11 or newer in the Node 24 release line and the pinned `pnpm@12.15.0` package manager. Rust, Anchor, and the Solana CLI are only needed when working on the on-chain program.

```bash
git clone https://github.com/ShardulB6/SolanaVotingWebsite.git
cd SolanaVotingWebsite/my-better-t-app
pnpm install --frozen-lockfile
node --input-type=module -e 'import { randomBytes } from "node:crypto"; import { writeFileSync } from "node:fs"; writeFileSync("apps/web/.env", "AUTH_SESSION_SECRET=" + randomBytes(32).toString("hex") + "\n", { flag: "wx", mode: 0o600 })'
pnpm run dev:web
```

Open [http://localhost:3001](http://localhost:3001) in a wallet-enabled browser. If `apps/web/.env` already exists, add a random `AUTH_SESSION_SECRET` of at least 32 characters to it instead of running the file-creation command. Wallet sign-in, poll creation, and voting work without SOL. With Cloudflare credentials unset, the Node server automatically creates and migrates a local SQLite database. See the [database setup guide](./my-better-t-app/apps/web/HYBRID_VOTING.md) to use hosted D1.

See the [application README](./my-better-t-app/README.md) for authentication details, tests, and UI customization.

## Share the site with Cloudflare Tunnel

The current setup runs the app on the host computer at port 4000 and uses Cloudflare Tunnel for access from other computers and phones. After completing the local setup above, stop the local server and run this from `my-better-t-app/`:

```bash
pnpm --filter web run dev:bare --host 127.0.0.1 --port 4000 --strictPort
```

Install [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/), then open a second terminal on the same host computer and run:

```bash
cloudflared tunnel --url http://127.0.0.1:4000
```

Copy the public `https://….trycloudflare.com` URL printed by `cloudflared`. Keep the tunnel running. In the first terminal, stop the app and restart it with that specific hostname allowed, replacing `your-tunnel-hostname.trycloudflare.com` with the hostname from the printed URL (without `https://` or a trailing slash):

```bash
__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=your-tunnel-hostname.trycloudflare.com pnpm --filter web run dev:bare --host 127.0.0.1 --port 4000 --strictPort
```

Open the public HTTPS tunnel URL on the other computer or phone. `localhost` always refers to the device opening the link; only use `http://127.0.0.1:4000` on the host computer. Leave `VITE_PUBLIC_APP_URL` unset so shared poll links and QR codes use the tunnel's current origin.

A tunnel does not provide a D1 binding. Leave Cloudflare credentials unset to use local SQLite, or configure all three server-side D1 credentials and migrate the database as described in the [D1/tunnel guide](./my-better-t-app/apps/web/HYBRID_VOTING.md#node-development-and-cloudflare-tunnel). Keep all devices on the same HTTPS origin for wallet and ballot challenges.

Keep the host computer awake and both the app and `cloudflared` running. A Quick Tunnel URL is temporary and can change when the tunnel restarts; update the allowed hostname and share the new URL after a restart. If Vite reports “Blocked request,” check the allowed hostname. If the host's local URL refuses connections, check that the app is running on port 4000.

## Host the project

The website can be shared through Cloudflare Tunnel as described above or deployed to Cloudflare Workers with a D1 database. A Worker deployment has its own public HTTPS URL and does not need a tunnel or a running host computer. The current app requires no custom Solana program deployment. These are operator instructions; the repository does not automatically publish resources.

For the separate legacy Anchor implementation, follow the [program setup and upgrade guide](./my-better-t-app/solana/README.md). Its existing accounts and deployment remain separate from the current D1 voting flow.

### 1. Configure production settings

From `my-better-t-app/`, create a separate production session secret in the infrastructure package's ignored environment file:

```bash
node --input-type=module -e 'import { randomBytes } from "node:crypto"; import { writeFileSync } from "node:fs"; writeFileSync("packages/infra/.env", "NODE_ENV=production\nAUTH_SESSION_SECRET=" + randomBytes(32).toString("hex") + "\n", { flag: "wx", mode: 0o600 })'
```

If the file already exists, add the settings manually. Preserve the production secret between releases; rotating it signs existing users out. The infrastructure schema imports the session settings, and `alchemy.run.ts` binds `AUTH_SESSION_SECRET` as a secret Worker environment variable and sets `NODE_ENV=production`.

Create `apps/web/.env.production.local` with the public production build settings:

```dotenv
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
# Optional: set this to the final HTTPS site origin once you have one.
# VITE_PUBLIC_APP_URL=https://vote.example.com
```

All `VITE_` values are embedded in browser assets. Use a public Devnet RPC endpoint that permits browser access; do not include private credentials in its URL. Voters need no SOL. A creator needs Devnet SOL only to publish the final results Memo.

Leave `VITE_PUBLIC_APP_URL` unset to share links using the current website origin, or set it to an HTTPS origin serving this same app and database. A localhost QR link cannot reach your desktop from a phone. Keep secrets in ignored files or your deployment environment.

### 2. Publish the website to Cloudflare

Use a Cloudflare account with Workers enabled. From `my-better-t-app/`, connect the account through the pinned Alchemy v2 CLI, then deploy a stable `prod` stage:

```bash
pnpm --filter @my-better-t-app/infra exec alchemy profile
pnpm --filter @my-better-t-app/infra exec alchemy deploy --stage prod
```

In the profile screen, add Cloudflare and complete OAuth or API-token setup. Alchemy v2 uses `profile` for account setup; see its [profile documentation](https://alchemy.run/environments/profiles/). The stack in [`packages/infra/alchemy.run.ts`](./my-better-t-app/packages/infra/alchemy.run.ts) builds the TanStack Start app, uploads its server and assets to Workers, and uses `Cloudflare.state()` for remote deployment state. It also creates and binds a D1 database as `DB`, applies the committed Drizzle migrations, and outputs the `web` HTTPS URL, database ID, and database name. Let Alchemy own migrations for this database; do not also apply the standalone Drizzle migration command to it. Local SQLite data and legacy on-chain accounts are not automatically copied into D1.

For CI, provide `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as CI secrets, supply the production settings above, install with the lockfile, and run the deployment command with `--yes`. The repository does not include an automatic deployment workflow.

Use the same Cloudflare account and `--stage prod` for later releases. After changing public build settings, force a rebuild and redeploy so a source cache cannot retain the old browser configuration:

```bash
pnpm --filter @my-better-t-app/infra exec alchemy deploy --stage prod --force
```

The app needs server functions for wallet verification and sessions; uploading only client assets to a static host is insufficient. Other providers need their own TanStack Start server adapter and runtime configuration. Production must use HTTPS for the secure session cookie.

### 3. Check the hosted app

Open the deployed HTTPS URL, sign in, and reload to confirm the session persists. Create a poll, open its shared link on another device, submit a free signed vote from a second wallet, and confirm results refresh and the vote stays submitted after reload. Download the voter receipt. Check creator-only closure and deletion, sign-out, and direct navigation to `/dashboard` and `/polls/<id>`. After ending a test poll, use a creator wallet funded with Devnet SOL to publish its results, then download and independently verify the record with the [results verifier](./my-better-t-app/apps/web/HYBRID_VOTING.md#independent-verification).

If database requests fail, check the D1 binding and applied migrations. For a tunneled Node server, check its D1 credentials or local SQLite path. If results publication fails, check the creator wallet network, Devnet balance, and browser RPC access. If sign-in fails in production, check the Worker session-secret binding and HTTPS origin.

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
pnpm exec vp test run
```

## License and credits

The source code is licensed under the [MIT License](./LICENSE). The license preserves the copyright notice for UI code adapted from shadcn/ui. Third-party artwork and dependencies retain their respective licenses.

Created in [T3 Code](https://t3.codes), with an application scaffold from [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack).
