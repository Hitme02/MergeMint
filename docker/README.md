# Local Orchestration with Docker Compose

This stack brings up Postgres, a local Hardhat node, deploys contracts, then boots the backend, the Next.js frontend, and the Vite DApp UI.

## What it does
- db: Postgres 15 with database `git_onchain_rewards`
- hardhat-node: Hardhat local chain on 8545
- deployer: Deploys TestToken and ContributionRegistry, sets verifiers, funds registry
- backend: Express verifier service (port 4000)
- frontend: Next.js app (port 3000)
- dapp: Vite DApp UI (port 5173)
- tunnel (optional): Cloudflare quick tunnel exposing backend publicly for GitHub webhooks

## Usage

1) Start the stack:

```sh
cd docker
docker compose up --build -d
```

2) Read contract addresses from deployer logs (run once at start):

```sh
docker compose logs deployer | grep -E "TOKEN_ADDRESS|REGISTRY_ADDRESS|Verifier configured"
```

3) Export REGISTRY_ADDRESS and restart backend/frontend with it set:

```sh
# Replace 0x... with the actual address from step 2
export REGISTRY_ADDRESS=0x...
# Recreate only backend and frontend with the env in scope
REGISTRY_ADDRESS=$REGISTRY_ADDRESS docker compose up -d --no-deps --build backend frontend
```

4) (Optional) Enable on-chain registration from backend:
- Set VERIFIER_PRIVATE_KEY to one of the Hardhat accounts (e.g., Account #1 from logs)
- Pass its public address to deployer via VERIFIER_PUBLIC so it’s added as a verifier.

```sh
# Example using Account #1 from hardhat-node standard keys
export VERIFIER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
export VERIFIER_PUBLIC=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
VERIFIER_PUBLIC=$VERIFIER_PUBLIC docker compose up -d --no-deps --build deployer
REGISTRY_ADDRESS=$(docker compose logs deployer | grep REGISTRY_ADDRESS | tail -n1 | awk -F= '{print $2}')
REGISTRY_ADDRESS=$REGISTRY_ADDRESS VERIFIER_PRIVATE_KEY=$VERIFIER_PRIVATE_KEY docker compose up -d --no-deps --build backend frontend
```

5) Open the app at http://localhost:3000
- Bind your wallet on the Bind page
- Trigger a dev webhook to simulate a merged PR:

```sh
curl -X POST http://localhost:4000/dev/webhook \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "closed",
    "pull_request": {
      "merged": true,
      "number": 123,
      "additions": 60,
      "html_url": "https://github.com/acme/repo/pull/123",
      "user": {"login": "alice"}
    },
    "repository": {"full_name": "acme/repo"}
  }'
```

6) View your contribution at http://localhost:3000/contributions and click Claim.

Alternative DApp (Vite): http://localhost:5173
- Animated dark neon theme with Tailwind + Framer Motion
- Configure via REGISTRY_ADDRESS env (compose already wires this) and backend URL at http://localhost:4000

## Tear down

```sh
docker compose down -v
```

Notes:
- The deployer runs only once; if you restart the chain, also re-run deployer.
- For a clean slate, bring everything down with `-v` to clear Postgres data.

## Expose webhooks publicly (Docker-only)

To receive real GitHub webhooks without installing a host-side tunnel, use the bundled Cloudflare quick tunnel service:

1) Start the tunnel (if not already running):

```sh
docker compose up -d tunnel
```

2) Grab the public URL from logs (looks like https://xxxx.trycloudflare.com):

```sh
docker compose logs -f tunnel | grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' | head -n1
```

3) Set your GitHub repo webhook to point at: {PUBLIC_URL}/webhook

   In development, you can set it programmatically using your GitHub OAuth session token:

```sh
curl -X POST http://localhost:4000/dev/setup-webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Bearer: <owner_oauth_token>" \
  -d '{
    "repo": "ownerName/repoName",
    "webhook_url": "https://xxxx.trycloudflare.com/webhook"
  }'
```

4) Redeliver the "pull_request" event for your merged PR from GitHub → Repo Settings → Webhooks → Recent Deliveries, and confirm a 2xx response.

Notes:
- In dev, the backend accepts unsigned webhooks when `ALLOW_DEV_WEBHOOK=true` and no `GITHUB_WEBHOOK_SECRET` is set.
- For production, set a strong `GITHUB_WEBHOOK_SECRET` in the backend and configure the same secret in the GitHub webhook.
