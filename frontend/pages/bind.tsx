import { useEffect, useState } from 'react';
import { ethers } from 'ethers';

const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
const devRpcUrl = process.env.NEXT_PUBLIC_DEV_JSON_RPC_URL as string | undefined; // e.g. http://127.0.0.1:8545
const devSignerIndex = Number(process.env.NEXT_PUBLIC_DEV_SIGNER_INDEX || '0');

export default function Bind() {
  const [github, setGithub] = useState('');
  const [status, setStatus] = useState<string>('');
  const [hasInjected, setHasInjected] = useState(false);
  const [canUseDevRpc, setCanUseDevRpc] = useState(Boolean(devRpcUrl));

  useEffect(() => {
    setHasInjected(!!(typeof window !== 'undefined' && (window as any).ethereum));
  }, []);

  async function requestNonceInjected() {
    setStatus('Requesting nonce (injected)...');
    const res = await fetch(`${apiBase}/bind/nonce`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github })
    });
    if (!res.ok) return setStatus('Failed to get nonce');
    const { messageToSign } = await res.json();
    await signAndVerifyInjected(messageToSign);
  }

  async function requestNonceDevRpc() {
    if (!devRpcUrl) {
      setStatus('Dev RPC not configured');
      return;
    }
    setStatus('Requesting nonce (dev RPC)...');
    const res = await fetch(`${apiBase}/bind/nonce`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github })
    });
    if (!res.ok) return setStatus('Failed to get nonce');
    const { messageToSign } = await res.json();
    await signAndVerifyDevRpc(messageToSign);
  }

  async function signAndVerifyInjected(message: string) {
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      const sig = await signer.signMessage(message);
      await finishVerify(addr, sig);
    } catch (e: any) {
      setStatus(`Error (injected): ${e.message || e}`);
    }
  }

  async function signAndVerifyDevRpc(message: string) {
    try {
      if (!devRpcUrl) throw new Error('Dev RPC URL is not set');
      // Use local Hardhat node signer index (default 0)
      const provider = new ethers.JsonRpcProvider(devRpcUrl);
      const signer = await provider.getSigner(devSignerIndex);
      const addr = await signer.getAddress();
      const sig = await signer.signMessage(message);
      await finishVerify(addr, sig);
    } catch (e: any) {
      setStatus(`Error (dev RPC): ${e.message || e}`);
    }
  }

  async function finishVerify(addr: string, sig: string) {
    const res = await fetch(`${apiBase}/bind/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github, wallet: addr, signature: sig })
    });
    const json = await res.json();
    if (json.bound) setStatus(`Bound ${github} → ${addr}`);
    else setStatus(`Verify failed: ${JSON.stringify(json)}`);
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Bind Wallet</h1>
      <p>Enter your GitHub username and sign a message to bind it to your wallet.</p>

      {!hasInjected && (
        <p style={{ color: '#8a6d3b' }}>
          No injected wallet detected. Install MetaMask or use the local dev fallback below.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input placeholder="github username" value={github} onChange={e => setGithub(e.target.value)} />
        <button onClick={requestNonceInjected} disabled={!github || !hasInjected}>Bind (Injected)</button>
        {canUseDevRpc && (
          <button onClick={requestNonceDevRpc} disabled={!github}>Bind (Local dev)</button>
        )}
      </div>

      {canUseDevRpc && (
        <small>
          Using dev RPC: {devRpcUrl} (signer index {devSignerIndex}). Run a Hardhat node locally to use this option.
        </small>
      )}

      <p>{status}</p>
    </main>
  );
}
