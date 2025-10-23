import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { listContributions } from '../utils/api'
import { Copy, ExternalLink, CheckCircle2 } from 'lucide-react'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import HelpTip from '../components/HelpTip'

const REGISTRY_ADDRESS = import.meta.env.VITE_REGISTRY_ADDRESS
const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:4000'
const EXPLORER_BASE = import.meta.env.VITE_EXPLORER_BASE || 'https://etherscan.io'

export default function Contributions() {
  const [beneficiary, setBeneficiary] = useState(localStorage.getItem('wallet') || '')
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const rows = await listContributions(beneficiary)
      setItems(rows)
    } finally {
      setLoading(false)
    }
  }

  async function claim(id: string) {
    try {
      if (!REGISTRY_ADDRESS) return toast.error('Missing VITE_REGISTRY_ADDRESS')
      const eth = (window as any).ethereum
      if (!eth) return toast.error('No wallet detected')
      const provider = new ethers.BrowserProvider(eth)
      await provider.send('eth_requestAccounts', [])
      const signer = await provider.getSigner()
      const abi = ['function claimReward(bytes32 id) external']
      const c = new ethers.Contract(REGISTRY_ADDRESS, abi, signer)
  const tx = await c.claimReward(id, { gasLimit: 200000n })
      const rec = await tx.wait()
      try {
        await fetch(`${API_BASE}/claim/mark`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, txHash: rec?.hash || tx.hash }) })
      } catch {}
      toast.success('Claimed! ' + (rec?.hash || tx.hash))
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Claim failed')
    }
  }

  useEffect(() => { if (beneficiary) load() }, [])

  return (
    <main className="max-w-6xl mx-auto px-4 pt-24">
      <div className="glass rounded-xl p-6">
        <div className="mb-4">
          <HelpTip title="About Contributions">
            <ul className="list-disc pl-5 space-y-1">
              <li>This table lists contributions registered on-chain for the wallet address above.</li>
              <li>Only registered items are claimable. If your merged PR isn’t here, the repo owner hasn’t registered it yet.</li>
              <li>Click <span className="text-white/90">Claim</span> to send the on-chain transaction. Make sure your wallet is connected to the correct network.</li>
              <li>You can paste a different wallet to view its registered contributions, but only that wallet can claim them.</li>
            </ul>
          </HelpTip>
        </div>
        <div className="flex gap-3 items-center">
          <input className="w-full input-neon bg-card rounded-md px-4 py-3" placeholder="wallet address" value={beneficiary} onChange={e => setBeneficiary(e.target.value)} />
          <button onClick={load} className="btn-neon">Load</button>
        </div>
        <div className="mt-6">
          {loading ? (
            <SkeletonRows />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-zinc-400">
                  <tr>
                    <th className="text-left font-medium py-2">Repo</th>
                    <th className="text-left font-medium py-2">ID</th>
                    <th className="text-left font-medium py-2">Payout</th>
                    <th className="text-left font-medium py-2">Claimed</th>
                    <th className="text-left font-medium py-2">Tx</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className={`border-t border-white/5 hover:bg-white/5 transition ${it.claimed ? 'opacity-60' : ''}`}>
                      <td className="py-2">{it.repo}</td>
                      <td className="py-2 font-mono text-xs flex items-center gap-2">
                        <span>{it.id.slice(0,12)}…</span>
                        <button onClick={() => navigator.clipboard.writeText(it.id)} className="p-1 rounded hover:bg-white/10"><Copy size={14} /></button>
                      </td>
                      <td className="py-2">{it.payout_mode || '-'}</td>
                      <td className="py-2">{it.claimed ? <CheckCircle2 size={16} className="text-emerald-400" /> : '—'}</td>
                      <td className="py-2">
                        {it.tx_hash ? (
                          <div className="flex items-center gap-2">
                            <a className="inline-flex items-center gap-1 hover:underline" href={`${EXPLORER_BASE}/tx/${it.tx_hash}`} target="_blank" rel="noreferrer">
                              <ExternalLink size={14} /> Explorer
                            </a>
                            <a className="inline-flex items-center gap-1 hover:underline" href={`/tx/${it.tx_hash}`}>
                              <ExternalLink size={14} /> Local
                            </a>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="py-2 text-right">
                        <button onClick={() => claim(it.id)} disabled={it.claimed} className="px-3 py-1 rounded-md border border-white/10 hover:border-white/20 disabled:opacity-50">{it.claimed ? 'Claimed' : 'Claim'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 w-full bg-white/5 rounded-md animate-pulse" />
      ))}
    </div>
  )
}
