import { useEffect, useState } from 'react'
import WalletConnectButton from '../components/WalletConnectButton'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import { useUser } from '../context/UserContext'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
const REGISTRY_ADDRESS = import.meta.env.VITE_REGISTRY_ADDRESS

export default function ContributorDashboard() {
  const { wallet } = useUser()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    if (!wallet) return
    setLoading(true)
    try {
      const res = await fetch(`${API}/contributions?beneficiary=${encodeURIComponent(wallet)}`)
      const j = await res.json()
      setItems(j.items || [])
    } catch (e: any) {
      toast.error(e.message || 'Failed to load')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [wallet])

  async function claim(id: string) {
    try {
      if (!REGISTRY_ADDRESS) return toast.error('Missing VITE_REGISTRY_ADDRESS')
      const eth = (window as any).ethereum
      if (!eth) return toast.error('No wallet')
      const provider = new ethers.BrowserProvider(eth)
      await provider.send('eth_requestAccounts', [])
      const signer = await provider.getSigner()
      const abi = ['function claimReward(bytes32 id) external']
      const c = new ethers.Contract(REGISTRY_ADDRESS, abi, signer)
  // Some local JSON-RPCs under-estimate; provide a healthy gas limit override.
  const tx = await c.claimReward(id, { gasLimit: 200000n })
      const rec = await tx.wait()
      try {
        await fetch(`${API}/claim/mark`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, txHash: rec?.hash || tx.hash }) })
      } catch {}
      toast.success('Claimed! ' + (rec?.hash || tx.hash))
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Claim failed')
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pt-24">
      <div className="flex items-center justify-between">
        <div className="text-2xl font-semibold">Contributor</div>
        <WalletConnectButton />
      </div>
      <div className="glass rounded-xl p-6 mt-4">
        {!wallet && <div className="text-sm text-zinc-400">Connect wallet to load contributions.</div>}
        {wallet && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-zinc-400">
                <tr>
                  <th className="text-left py-2">Repo</th>
                  <th className="text-left py-2">ID</th>
                  <th className="text-left py-2">Payout</th>
                  <th className="text-left py-2">Claimed</th>
                  <th className="text-left py-2">Tx</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id} className={`border-t border-white/5 ${it.claimed ? 'opacity-60' : ''}`}>
                    <td className="py-2">{it.repo}</td>
                    <td className="py-2 font-mono text-xs">{it.id.slice(0,12)}…</td>
                    <td className="py-2">{it.payout_mode}</td>
                    <td className="py-2">{it.claimed ? 'Yes' : 'No'}</td>
                    <td className="py-2">{it.tx_hash ? <a className="hover:underline" href={`/tx/${it.tx_hash}`}>Local</a> : '—'}</td>
                    <td className="py-2 text-right"><button onClick={() => claim(it.id)} disabled={it.claimed} className="btn-neon disabled:opacity-50">{it.claimed ? 'Claimed' : 'Claim'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
