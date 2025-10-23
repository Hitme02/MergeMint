import { useEffect, useMemo, useState } from 'react'
import WalletConnectButton from '../components/WalletConnectButton'
import { ethers } from 'ethers'
import { ExternalLink, Copy, CheckCircle2, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { githubOwnerPRs, ownerRegisterPR } from '../utils/api'
import HelpTip from '../components/HelpTip'

const RPC_URL = import.meta.env.VITE_JSON_RPC_URL || 'http://localhost:8545'
const REGISTRY_ADDRESS = import.meta.env.VITE_REGISTRY_ADDRESS
const EXPLORER_BASE = import.meta.env.VITE_EXPLORER_BASE || ''
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
const ABI = [
  'event ContributionRegistered(bytes32 indexed id, address indexed beneficiary, string repo, bytes32 commitHash, string evidenceURI, uint256 reward, uint8 payoutMode, address token, address indexed registrar)',
  'function contributions(bytes32) view returns (address beneficiary,string repo,bytes32 commitHash,string evidenceURI,uint256 reward,uint8 payoutMode,address token,bool claimed,uint64 registeredAt,address registrar)'
]

export default function OwnerPRs() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [lookback, setLookback] = useState(5000)
  const [repo, setRepo] = useState('')
  const [author, setAuthor] = useState('')
  const [ghToken, setGhToken] = useState<string>(() => localStorage.getItem('gh_token') || '')
  const [ownerToken] = useState<string>(() => localStorage.getItem('owner_token') || '')

  const explorer = useMemo(() => EXPLORER_BASE.replace(/\/$/, ''), [])

  async function load() {
    if (!REGISTRY_ADDRESS) {
      setStatus('Missing VITE_REGISTRY_ADDRESS')
      return
    }
    setLoading(true)
    setStatus('Loading PRs from events…')
    try {
      const eth = (window as any).ethereum
      const provider = eth ? new ethers.BrowserProvider(eth) : new ethers.JsonRpcProvider(RPC_URL)
      const iface = new ethers.Interface(ABI)
      const head = await provider.getBlockNumber()
      const fromBlock = Math.max(0, head - lookback)
      const logs = await provider.getLogs({ address: REGISTRY_ADDRESS, fromBlock, toBlock: head })
      const contribLogs = logs
        .map(l => { try { return { log: l, parsed: iface.parseLog({ topics: l.topics as string[], data: l.data }) } } catch { return null } })
        .filter(Boolean)
        .filter((x: any) => x.parsed?.name === 'ContributionRegistered') as any[]

      // Build distinct by id (latest only)
      const map = new Map<string, any>()
      for (const { log, parsed } of contribLogs) {
        const id = parsed.args?.[0] as string
        const beneficiary = parsed.args?.[1] as string
        const repo = parsed.args?.[2] as string
        map.set(id, { id, beneficiary, repo, tx: log.transactionHash })
      }
      const items = Array.from(map.values()).reverse()

      // Query claimed flags (batched-ish)
      const c = new ethers.Contract(REGISTRY_ADDRESS, ABI, provider)
      for (const it of items) {
        try {
          const r = await c.contributions(it.id)
          it.claimed = !!r[7]
        } catch {}
      }
      setRows(items)
      setStatus('')
    } catch (e: any) {
      setStatus(e.message || 'Failed to load')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function loadFromGitHub() {
    try {
      if (!repo.includes('/')) return toast.error('Enter repo as owner/name')
      if (!ghToken) return toast.error('Sign in with GitHub to query this repo')
      setLoading(true)
      const items = await githubOwnerPRs({ repo, author: author || undefined, state: 'all', merged: true, per_page: 50, page: 1 }, ghToken)
      setRows(items.map((p:any)=>({
        id: p.id,
        repo,
        beneficiary: p.login,
        tx: undefined,
        claimed: undefined,
        pr: p
      })))
      setStatus('')
    } catch (e: any) {
      setStatus(e.message || 'Failed to load PRs')
    } finally { setLoading(false) }
  }

  async function registerRow(it: any) {
    try {
      if (!it?.pr) return
      if (!ownerToken) return toast.error('Sign in on Owner page first')
      if (!ghToken) return toast.error('Sign in with GitHub')
      const repoName = it.pr.repo_full_name || repo
      const prNum = it.pr.number
      setStatus('Registering PR…')
      await ownerRegisterPR(repoName, prNum, ownerToken, ghToken)
      toast.success('Registered')
      setStatus('')
    } catch (e: any) {
      setStatus(e?.response?.data?.error || e.message || 'Register failed')
      toast.error(e?.message || 'Register failed')
    }
  }

  function loginGithub() {
    window.location.href = `${API_BASE}/auth/github/start`
  }

  return (
    <main className="max-w-6xl mx-auto px-4 pt-24 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Pull Requests</h2>
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2">
            <input type="text" placeholder="owner/name" className="w-56 input-neon bg-card rounded-md px-2 py-1 text-sm" value={repo} onChange={e=>setRepo(e.target.value)} />
            <input type="text" placeholder="author (optional)" className="w-40 input-neon bg-card rounded-md px-2 py-1 text-sm" value={author} onChange={e=>setAuthor(e.target.value)} />
            <button onClick={loadFromGitHub} className="px-3 py-2 rounded-md border border-white/10 hover:border-white/20 inline-flex items-center gap-1 text-sm"><Search size={14} /> Query GitHub</button>
          </div>
          <input type="number" className="w-28 input-neon bg-card rounded-md px-2 py-1 text-sm" value={lookback} onChange={e=>setLookback(Number(e.target.value)||0)} />
          <button onClick={load} className="btn-neon">Refresh Events</button>
          <WalletConnectButton />
          {!ghToken && (
            <button onClick={loginGithub} className="px-3 py-2 rounded-md border border-white/10 hover:border-white/20 text-sm">Sign in with GitHub</button>
          )}
        </div>
      </div>
      <HelpTip title="Two views: on-chain events and GitHub">
        <p>
          Use <b>Refresh Events</b> to list PRs that have already been registered on-chain in the last N blocks.
          Or query GitHub to search merged PRs for a repo/author and compare against the chain.
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><b>Lookback</b> controls how many recent blocks are scanned for events.</li>
          <li>Each row shows the contribution ID, beneficiary, and a link to the tx or the PR on GitHub.</li>
          <li>Claimed shows a check if the reward has been claimed on-chain.</li>
        </ul>
      </HelpTip>
      {status && <div className="text-sm text-zinc-400">{status}</div>}
      <div className="glass rounded-xl p-6 text-sm">
        {loading ? (
          <div className="space-y-2">{Array.from({length:6}).map((_,i)=>(<div key={i} className="h-10 bg-white/5 rounded animate-pulse"/>))}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-zinc-400">
                <tr>
                  <th className="text-left py-2">Repo</th>
                  <th className="text-left py-2">ID</th>
                  <th className="text-left py-2">Beneficiary</th>
                  <th className="text-left py-2">Tx</th>
                  <th className="text-left py-2">Claimed</th>
                  <th className="text-left py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(it => (
                  <tr key={it.id} className={`border-t border-white/5 ${it.claimed ? 'opacity-60' : ''}`}>
                    <td className="py-2">{it.repo || repo}</td>
                    <td className="py-2 font-mono text-xs flex items-center gap-2">
                      <span>{(it.id || it.pr?.merge_commit_sha || it.pr?.head_sha || '').toString().slice(0,12)}…</span>
                      <button onClick={() => { navigator.clipboard.writeText(it.id); toast.success('ID copied') }} className="p-1 rounded hover:bg-white/10"><Copy size={14} /></button>
                    </td>
                    <td className="py-2 font-mono text-xs">{it.beneficiary || it.pr?.login || '—'}</td>
                    <td className="py-2">
                      {it.tx ? (
                        <div className="flex items-center gap-2">
                          {EXPLORER_BASE && <a className="inline-flex items-center gap-1 hover:underline" href={`${explorer}/tx/${it.tx}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Explorer</a>}
                          <a className="inline-flex items-center gap-1 hover:underline" href={`/tx/${it.tx}`}><ExternalLink size={14} /> Local</a>
                        </div>
                      ) : it.pr?.html_url ? (
                        <a className="inline-flex items-center gap-1 hover:underline" href={it.pr.html_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> GitHub</a>
                      ) : '—'}
                    </td>
                    <td className="py-2">{it.claimed ? <CheckCircle2 size={16} className="text-emerald-400" /> : (it.pr ? (it.pr.merged_at ? 'Merged' : '—') : '—')}</td>
                    <td className="py-2">
                      {it.pr && !it.tx && (
                        <button onClick={() => registerRow(it)} className="px-3 py-1 rounded-md border border-white/10 hover:border-white/20">Register</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
