# my-better-t-app

Source code is licensed under the [MIT License](../LICENSE), also available at `/license` in the app. The shadcn/ui copyright notice is preserved for adapted UI code. Third-party artwork and dependencies retain their respective licenses.

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Start, Self, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Start** - SSR framework with TanStack Router
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Vite+** - Unified Vite toolchain, workspace task runner, linting, and formatting

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

Create the local session encryption secret (keep `.env` out of git):

```bash
node --input-type=module -e 'import { randomBytes } from "node:crypto"; import { writeFileSync } from "node:fs"; writeFileSync("apps/web/.env", "AUTH_SESSION_SECRET=" + randomBytes(32).toString("hex") + "\n", { flag: "wx", mode: 0o600 })'
```

This creates the file only if it does not exist. If you already have an `.env`, add `AUTH_SESSION_SECRET` with a random value of at least 32 characters instead.

Then, run the local web development server. The command loads and validates the app's environment with Varlock:

```bash
pnpm run dev:web
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the fullstack application.

Local web development uses an automatically initialized SQLite file; hosted voting uses Cloudflare D1 through Drizzle. See [hybrid voting](apps/web/HYBRID_VOTING.md) for D1, tunnels, and result verification. To use port 4000 and allow access from other devices, run:

```bash
pnpm --filter web run dev:bare --host 0.0.0.0 --port 4000 --strictPort
```

On another device, use the host computer's network address with port 4000 instead of `localhost`.

## Solana Sign-In

The home page adapts [shadcn login-04](https://ui.shadcn.com/blocks/login#login-04) to wallet authentication and uses the supplied Husky Hacktober Fest artwork. Its event details and Solana learning links come from the [Hacktoberfest Hack Day Toronto x HuskyHack MLH listing](https://events.mlh.com/events/15057-husky-hacktoberfest-hack-day-toronto). Shared event information lives in `apps/web/src/lib/event.ts` and also identifies the project in the wallet's sign-in message. This is a community voting project for the hack day; registration remains on MLH.

Install a Solana wallet such as Phantom or Solflare, open the site in that browser (or the wallet's mobile browser), and choose **Connect Solana wallet**. Approve the sign-in message to verify ownership of your address. No RPC key, SOL balance, or transaction is needed for authentication.

Wallets are discovered through Wallet Standard. The app uses `solana:signIn` when available, with `standard:connect` and `solana:signMessage` as a fallback. The server issues a random, five-minute challenge bound to the request's domain and origin, then validates the message, public key, address, and Ed25519 signature using `@solana/wallet-standard-util`. Authentication follows the [Sign In With Solana specification](https://github.com/phantom/sign-in-with-solana).

Successful verification creates a 24-hour encrypted, HttpOnly, SameSite cookie; production cookies also require HTTPS. Reloading the page restores the session, and **Sign out** clears it. The challenge is removed from the current browser session after a verification attempt. Sessions are stateless: global revocation of copied cookies and global single-use challenge enforcement would require a shared server-side store.

The implementation is split across:

- `apps/web/src/components/login-form.tsx`: login-04 layout, wallet selection, loading, cancellation, and signed-in state.
- `apps/web/src/lib/wallet.ts`: wallet discovery and message signing.
- `apps/web/src/lib/auth.ts`: validated TanStack server functions.
- `apps/web/src/lib/session.server.ts`: server verification and encrypted sessions. It reads the secret from the runtime environment so it is never bundled into client assets.

For production, set a separate `AUTH_SESSION_SECRET` in the deployment environment and `NODE_ENV=production`, and serve over HTTPS. Alchemy binds the secret to the Cloudflare Worker as a secret environment variable. Local `dev:bare` and `serve` load the app schema through Varlock; other Node server launch commands must also load the schema or inject the runtime variables. Authentication establishes wallet ownership. Voting requires a separate free wallet message; only publishing final results uses a Solana transaction. The database enforces one vote per wallet.

Run the authentication tests with:

```bash
pnpm exec vp test apps/web/src/lib/session.test.ts
```

## Voting dashboard

Successful wallet sign-in opens `/dashboard`. Users create public polls with 2–6 choices, share stable QR links, and follow counts that refresh every five seconds. Polls and signed ballots are stored in Cloudflare D1 through Drizzle. Voters need no SOL: they sign a message, and the database atomically permits one final ballot per wallet. Creators can close or delete polls using their authenticated session.

After closure or expiry, the creator can publish the final results hash with one small Solana Devnet Memo transaction. Anyone can download the signed results record and verify its signatures, tally, and hash against the on-chain transaction. Solana commits to the published record; duplicate prevention and collecting the votes depend on the application and database. Multiple wallets are still possible for one person.

See [free voting with D1, Drizzle, and Solana](apps/web/HYBRID_VOTING.md) for setup, migration ownership, tunnel access, trust boundaries, cost behavior, and independent verification. The earlier Anchor program remains in `solana/` as a separate implementation; the web client no longer needs its program ID, and older on-chain polls are not migrated automatically.

Run the web tests with:

```bash
pnpm exec vp test
```

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@my-better-t-app/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Environment Configuration

Each app owns its environment schema in `.env.schema`. Varlock generates `src/env.ts` during installation; run `pnpm run env:generate` after changing a schema. Commit schemas, and keep secrets in ignored env files or your deployment platform.

Import the generated `ENV` accessor in application code. See [Varlock's monorepo guide](https://varlock.dev/guides/monorepos/).

Bun's automatic env loading is disabled in `bunfig.toml`; the framework integration or server bootstrap loads Varlock. Node deployments must include Varlock and its dependencies alongside the app schema.

Run standalone Node/Bun tools that use Varlock from the owning app directory so they load that app's schema and env files. `env:generate` only generates TypeScript files; it does not initialize environment values in a subsequent command.

## Git Hooks and Formatting

- Optional native Vite+ hooks: `pnpm run hooks:setup`
- Docs: [Vite+ commit hooks](https://viteplus.dev/guide/commit-hooks)
- Run checks: `pnpm run check`

## Project Structure

```
my-better-t-app/
├── apps/
│   └── web/         # Fullstack application (React + TanStack Start)
├── packages/
│   ├── config/      # Shared TypeScript configuration
│   ├── infra/       # Deployment configuration
│   └── ui/          # Shared shadcn/ui components and styles
```

## Available Scripts

- `pnpm run dev`: Start development through Alchemy (requires provider configuration)
- `pnpm run build`: Build all applications
- `pnpm run dev:web`: Start only the web application
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run check`: Run Vite+ format/lint checks and workspace TypeScript checks
- `pnpm run lint`: Run Vite+ lint checks
- `pnpm run format`: Run Vite+ formatting
- `pnpm run staged`: Run Vite+ checks against staged files
- `pnpm run hooks:setup`: Install Vite+ native Git hooks with `vp config`
