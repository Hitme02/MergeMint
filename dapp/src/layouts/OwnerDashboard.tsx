import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import WalletConnectButton from '../components/WalletConnectButton'
import toast from 'react-hot-toast'
import { ExternalLink, Copy } from 'lucide-react'
import HelpTip from '../components/HelpTip'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
const EXPLORER_BASE = import.meta.env.VITE_EXPLORER_BASE || ''

function shortenAddress(addr?: string, start: number = 6, end: number = 6) {
  if (!addr || typeof addr !== 'string') return addr || '—'
  if (addr.length <= start + end) return addr
  return `${addr.slice(0, start)}…${addr.slice(-end)}`
}

function StatCard(
  {
    title,
    value,
    className,
    isAddress = false,
    truncate = false,
    copyValue = false,
    explorerHref,
  }: { title: string; value: any; className?: string; isAddress?: boolean; truncate?: boolean; copyValue?: boolean; explorerHref?: string }
) {
  const full = value == null ? '—' : String(value)
  const display = isAddress ? shortenAddress(full) : full
  return (
    <div className={`glass p-4 rounded-md ${className || ''}`}>
      <div className="text-xs text-zinc-400">{title}</div>
      <div className="text-xl mt-1 flex items-center gap-2 min-w-0">
        <span className={(isAddress || truncate) ? 'flex-1 min-w-0 font-mono' : ''}>
          <span
            className={(isAddress || truncate) ? 'block truncate' : ''}
            title={(isAddress || truncate) ? full : undefined}
          >
            {display}
          </span>
        </span>
        {(isAddress || copyValue) && full && full !== '—' && (
          <button
            type="button"
            className="p-1 rounded hover:bg-white/10 shrink-0"
            onClick={() => {
              navigator.clipboard.writeText(full).then(() => toast.success('Copied to clipboard'))
            }}
            aria-label="Copy value"
            title="Copy value"
          >
            <Copy size={16} />
          </button>
        )}
        {explorerHref && full && full !== '—' && (
          <a
            className="p-1 rounded hover:bg-white/10 shrink-0"
            href={explorerHref}
            target="_blank"
            rel="noreferrer"
            aria-label="Open in explorer"
            title="Open in explorer"
          >
            <ExternalLink size={16} />
          </a>
        )}
      </div>
    </div>
  )
}

export default function OwnerDashboard() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/contract/stats`)
      const ct = res.headers.get('content-type') || ''
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`API ${res.status}: ${txt.slice(0, 180)}`)
      }
      if (!ct.includes('application/json')) {
        const txt = await res.text().catch(() => '')
        throw new Error(`Unexpected response from API: ${txt.slice(0, 180)}`)
      }
      const j = await res.json()
      setStats(j)
      setError(null)
    } catch (e: any) {
      setError(e.message || 'Failed to load stats')
      toast.error(e.message || 'Failed to load stats')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  return (
    <div className="flex min-h-[calc(100vh-5rem)]">
      <aside className="w-60 p-4 space-y-2 border-r border-white/10">
        <div className="font-semibold">Owner</div>
  <Nav label="Dashboard" href="/owner" />
  <Nav label="Contract Settings" href="/owner/settings" />
  <Nav label="Manage Verifier" href="/owner/verifier" />
  <Nav label="Reward Pool" href="/owner/pool" />
  <Nav label="Pull Requests" href="/owner/prs" />
      </aside>
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="text-2xl font-semibold">Dashboard</div>
          <WalletConnectButton />
        </div>
        <HelpTip title="Owner dashboard, at a glance">
          <p>
            This is your control room. You can see your registry’s address and balance, how many
            contributions are registered, and how many have been claimed. Use the menu on the left to
            adjust settings, manage the verifier, fund the pool, or inspect pull requests.
          </p>
        </HelpTip>
  {error && <div className="text-sm text-amber-400">{error} — ensure backend on :4000 is healthy.</div>}
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            title="Registry"
            value={stats?.registryAddress || '—'}
            isAddress
            className="col-span-2"
            explorerHref={EXPLORER_BASE ? `${EXPLORER_BASE.replace(/\/$/, '')}/address/${stats?.registryAddress}` : undefined}
          />
          <StatCard title="Native Balance (wei)" value={stats?.nativeBalance || '0'} truncate copyValue />
          <StatCard title="Contributions" value={stats?.totalContributions ?? '0'} />
          <StatCard title="Claimed" value={stats?.claimedCount ?? '0'} />
        </div>
        <div id="pool" className="glass p-4 rounded-md">
          <div className="font-semibold mb-2">Reward Pool</div>
          <div className="text-sm text-zinc-400">Deposit/withdraw controls can be added here. For demo, fund via deploy script.</div>
        </div>
      </main>
    </div>
  )
}

function Nav({ label, href }: { label: string; href: string }) {
  return <Link to={href} className="block px-2 py-1 rounded hover:bg-white/5 text-sm">{label}</Link>
}
