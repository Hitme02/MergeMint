# Optional features (scaffolds)

## AI scoring
- Hook: In `backend/src/processPR.ts`, after policy evaluation, call an AI microservice that scores PR quality (0-100).
- Store: Save score in `contributions` metadata or a new table keyed by id.
- Usage: Adjust reward or add labels based on score buckets.

## Badge NFTs
- Contract: An ERC-1155 or ERC-721 “Contributor Badge” minted when a contribution is registered or claimed.
- Flow: Verifier mints NFT to beneficiary with metadata linking to evidenceURI.
- UI: Show badges on profile page in the DApp.

## Batch Merkle distribution
- Use case: Aggregate many rewards into a merkle tree; publish root on-chain periodically; contributors claim with proofs.
- Changes: Add a MerkleDistributor contract and backend job that rolls up pending rewards.
- Benefit: Reduces on-chain txs and gas for mass payouts.
