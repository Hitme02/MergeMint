import { useEffect, useState } from 'react'
import WalletConnectButton from '../components/WalletConnectButton'
import toast from 'react-hot-toast'
import HelpTip from '../components/HelpTip'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

export default function OwnerVerifier() {
  const [stats, setStats] = useState<any>(null)
  const [beneficiary, setBeneficiary] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)

  async function loadStats() {
    try {
      const res = await fetch(`${API}/contract/stats`)
      const j = await res.json()
      setStats(j)
    } catch {}
  }
  useEffect(() => { loadStats() }, [])

  async function registerMissing() {
    try {
      setBusy(true)
      setResult(null)
      const res = await fetch(`${API}/dev/onchain/register-missing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ beneficiary }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Request failed')
      setResult(j)
      toast.success(`Registered ${j.count || 0} items`)
      await loadStats()
    } catch (e: any) {
      toast.error(e.message || 'Failed')
    } finally { setBusy(false) }
  }

  async function syncClaims() {
    try {
      setBusy(true)
      setResult(null)
      const res = await fetch(`${API}/dev/onchain/sync-claims`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ beneficiary }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Request failed')
      setResult(j)
      toast.success(`Synced ${j.updates?.length || 0} items`)
      await loadStats()
    } catch (e: any) {
      toast.error(e.message || 'Failed')
    } finally { setBusy(false) }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 pt-24 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Manage Verifier</h2>
        <WalletConnectButton />
      </div>
      <HelpTip title="Fix up data in development">
        <p>
          The verifier is the off-chain process that checks PRs and writes to the chain. These
          two buttons are helper tools for local development and testing:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><b>Register Missing</b>: looks at stored contributions for a beneficiary and registers any that are not yet on-chain.</li>
          <li><b>Sync Claims</b>: scans the chain and updates the database to mark already-claimed items.</li>
        </ul>
        <div className="text-xs text-zinc-400 mt-2">Note: These are safe to run but mainly intended for dev environments.</div>
      </HelpTip>
      <div className="glass rounded-xl p-6 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="glass p-4 rounded-md">
            <div className="text-xs text-zinc-400">Registry</div>
            <div className="font-mono mt-1 truncate" title={stats?.registryAddress || '—'}>{stats?.registryAddress || '—'}</div>
          </div>
          <div className="glass p-4 rounded-md">
            <div className="text-xs text-zinc-400">Native Balance (wei)</div>
            <div className="mt-1">{stats?.nativeBalance || '0'}</div>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-xs text-zinc-400 mb-1">Beneficiary (wallet to target)</div>
          <div className="flex gap-2">
            <input className="w-full input-neon bg-card rounded-md px-3 py-2" value={beneficiary} onChange={e=>setBeneficiary(e.target.value)} placeholder="0x…" />
            <button onClick={registerMissing} disabled={!beneficiary || busy} className="px-3 py-2 rounded-md border border-white/10 hover:border-white/20 disabled:opacity-50">Register Missing</button>
            <button onClick={syncClaims} disabled={!beneficiary || busy} className="px-3 py-2 rounded-md border border-white/10 hover:border-white/20 disabled:opacity-50">Sync Claims</button>
          </div>
          {result && (
            <pre className="mt-3 text-xs bg-black/30 p-3 rounded-md overflow-x-auto">{JSON.stringify(result, null, 2)}</pre>
          )}
        </div>
      </div>
    </main>
  )
}
