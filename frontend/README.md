# git-onchain-rewards — Frontend (Step 7)

A minimal Next.js UI to bind a wallet to a GitHub username and view your contributions.

## Run

```bash
cd frontend
npm install
npm run dev
```

- App: http://localhost:3000
- Backend API base (env): NEXT_PUBLIC_API_BASE (default http://localhost:4000)

### Dev JSON-RPC fallback (no injected wallet)

If you don't have MetaMask or an injected wallet in your browser, you can use a local Hardhat node to sign the bind message:

1. Start a local Hardhat node (separate terminal):
	```bash
	cd "../"
	npx hardhat node --hostname 127.0.0.1
	```
2. Start the frontend with these envs (or set them in your shell):
	```bash
	NEXT_PUBLIC_API_BASE=http://localhost:4000 \
	NEXT_PUBLIC_DEV_JSON_RPC_URL=http://127.0.0.1:8545 \
	NEXT_PUBLIC_DEV_SIGNER_INDEX=0 \
	npm run dev
	```
3. Open http://localhost:3000/bind and click "Bind (Local dev)".
