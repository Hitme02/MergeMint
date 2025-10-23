import { useEffect, useState } from 'react';
import { ethers } from 'ethers';

const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
const registryAddress = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as string | undefined;
const REGISTRY_ABI = [
  'function claimReward(bytes32 id) external',
];

type Item = {
  id: string;
  repo: string;
  evidence_uri: string;
  payout_mode?: string;
  tx_hash?: string | null;
  beneficiary?: string;
  claimed?: boolean;
};

export default function Contributions() {
  const [beneficiary, setBeneficiary] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState('');

  async function load() {
    try {
      setStatus('Loading...');
      const res = await fetch(`${apiBase}/contributions?beneficiary=${encodeURIComponent(beneficiary)}`);
      const json = await res.json();
      setItems(json.items || []);
      setStatus('');
    } catch (e: any) {
      setStatus(`Load error: ${e.message || e}`);
    }
  }

  async function claim(id: string) {
    try {
      if (!registryAddress) {
        setStatus('Set NEXT_PUBLIC_REGISTRY_ADDRESS to enable claiming');
        return;
      }
      if (!(window as any).ethereum) {
        setStatus('No injected wallet (MetaMask) detected');
        return;
      }
      setStatus('Sending claim transaction...');
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(registryAddress, REGISTRY_ABI, signer);
      const tx = await contract.claimReward(id);
      const rec = await tx.wait();
      setStatus(`Claimed! tx: ${rec?.hash || tx.hash}`);
    } catch (e: any) {
      setStatus(`Claim error: ${e.message || e}`);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Your Contributions</h1>
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="wallet address" value={beneficiary} onChange={e => setBeneficiary(e.target.value)} />
        <button onClick={load} disabled={!beneficiary}>Load</button>
      </div>
      <p>{status}</p>
      {!registryAddress && (
        <p style={{ color: '#8a6d3b' }}>
          To claim on-chain, set NEXT_PUBLIC_REGISTRY_ADDRESS in your env and reload the app.
        </p>
      )}
      <ul>
        {items.map((it) => (
          <li key={it.id} style={{ marginBottom: 8 }}>
            <div>
              <code>{it.id}</code> — {it.repo} — evidence: <a href={it.evidence_uri} target="_blank" rel="noreferrer">{it.evidence_uri}</a>
            </div>
            {registryAddress && (
              <div style={{ marginTop: 4 }}>
                <button onClick={() => claim(it.id)} disabled={it.claimed}>
                  {it.claimed ? 'Already claimed' : 'Claim'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
