/**
 * IPFS pinning stub.
 * In Step 6, we’ll construct an evidence bundle (JSON + optional files) and pin it.
 * Below are two examples to integrate with providers:
 *  - Web3.Storage
 *  - Pinata
 */

export type Evidence = {
  repo: string;
  commitHash: string;
  author?: string;
  prNumber?: number;
  metadata?: Record<string, any>;
  artifacts?: Array<{ name: string; content: string }>;
};

/**
 * Minimal stub: pretend to pin and return a deterministic-ish URI for local testing.
 * Replace with a real pin in Step 6.
 */
export async function pinToIPFS(evidence: Evidence): Promise<string> {
  const provider = (process.env.IPFS_PROVIDER || "stub").toLowerCase();
  try {
    if (provider === "web3storage" || provider === "web3.storage") {
      return await pinToIPFSWeb3Storage(evidence);
    }
    if (provider === "pinata") {
      return await pinToIPFSPinata(evidence);
    }
  } catch (e: any) {
    console.error("[ipfs] provider pin failed, falling back to stub:", e?.message || e);
  }
  // Fallback stub for local/dev
  const fakeCid = `bafy${Buffer.from(JSON.stringify(evidence)).toString("hex").slice(0, 20)}`;
  return `ipfs://${fakeCid}`;
}

/**
 * Web3.Storage provider
 */
export async function pinToIPFSWeb3Storage(evidence: Evidence): Promise<string> {
  const token = process.env.WEB3_STORAGE_TOKEN;
  if (!token) throw new Error("WEB3_STORAGE_TOKEN missing");
  // Lazy import to avoid dependency when unused
  const { Web3Storage, File } = await import('web3.storage');
  const client = new Web3Storage({ token });
  const files = [new File([JSON.stringify(evidence, null, 2)], 'evidence.json', { type: 'application/json' })];
  const cid = await client.put(files, { wrapWithDirectory: false });
  return `ipfs://${cid}`;
}

/**
 * Pinata provider
 */
export async function pinToIPFSPinata(evidence: Evidence): Promise<string> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error("PINATA_JWT missing");
  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`
    },
    body: JSON.stringify({ pinataContent: evidence, pinataMetadata: { name: 'git-onchain-evidence' }})
  });
  if (!res.ok) throw new Error(`Pinata failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return `ipfs://${json.IpfsHash}`;
}
