# git-onchain-rewards — Backend Verifier (Step 4)

A minimal, friendly backend that will soon verify merged PRs, craft an evidence bundle, pin to IPFS, and register contributions on-chain. Today it listens, verifies GitHub signatures, and prepares the path.

## Prereqs

- Node.js 18+
- Postgres running locally (or a DATABASE_URL you can reach)
- A local Hardhat node later (for on-chain calls), but not required yet

## Configure

1. Copy `.env.example` to `.env` and fill values:
   - `DATABASE_URL` — e.g. postgres://postgres:postgres@localhost:5432/git_onchain_rewards
   - `GITHUB_WEBHOOK_SECRET` — set this in your GitHub webhook too
   - `GITHUB_TOKEN` — optional, improves API rate limits
   - `RPC_URL`, `REGISTRY_ADDRESS`, `VERIFIER_PRIVATE_KEY` — used when we start registering on-chain
   - `MIN_LOC` — minimum lines of code added to accept a PR (default 5)
   - `DEFAULT_PAYOUT_MODE` — NATIVE or ERC20 (default NATIVE)
   - `DEFAULT_REWARD` — reward amount as a decimal string in wei or token units (default "0")
   - `DEFAULT_TOKEN` — ERC20 token address if using ERC20 payouts

## Install and run

From the project root:

```
cd backend
npm install
npm run migrate   # applies migrations
npm run dev       # starts the dev server (TS, auto-restart)
```

Server runs at:
- http://localhost:4000/health — quick status
- POST http://localhost:4000/webhook — GitHub webhook endpoint

## Webhook signature verification

- We capture the raw request body and compute HMAC-SHA256 with `GITHUB_WEBHOOK_SECRET`.
- We compare against the `X-Hub-Signature-256` header using a timing-safe comparison.

## IPFS pinning (stub)

- `src/ipfs.ts` provides a `pinToIPFS` stub that returns a fake `ipfs://` URI.
- Comments show how to wire `web3.storage` or `Pinata` in a few lines.
- In Step 6 we’ll replace this with the real pinning flow.

## Contract wrapper
## Step 6 — PR policy and register flow

- The webhook now processes `pull_request` events. If `action=closed && merged=true`, it evaluates a simple policy:
   - Lines added >= `MIN_LOC` (default 5)
   - CI status success (best-effort; ignored if API unavailable)
- It builds a JSON evidence bundle and pins via the stubbed `pinToIPFS`, computes the on-chain ID, optionally calls `registerContribution` (when `REGISTRY_ADDRESS` and `VERIFIER_PRIVATE_KEY` are set), and persists a record in Postgres.


- `src/contract.ts` sets up an ethers v6 contract instance with a verifier wallet.
- Exposes `registerContribution(...)` and a small `computeId(...)` helper.
- Make sure `REGISTRY_ADDRESS` and `VERIFIER_PRIVATE_KEY` are set before calling it.

## Notes

- This is intentionally minimal and safe to run locally.
- In production, use a multisig as contract owner, rotate keys, and restrict ingress with IP allowlists and rate-limiting.
- Docker Compose wiring arrives in Step 8.
