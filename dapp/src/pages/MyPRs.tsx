import { useEffect, useMemo, useState } from 'react'
import { githubMe, githubMyPRs, listContributions } from '../utils/api'
import { useUser } from '../context/UserContext'
import WalletConnectButton from '../components/WalletConnectButton'
import toast from 'react-hot-toast'
import { ethers } from 'ethers'
import { Copy, CheckCircle2, ExternalLink } from 'lucide-react'
import HelpTip from '../components/HelpTip'

const REGISTRY_ADDRESS = import.meta.env.VITE_REGISTRY_ADDRESS
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
const EXPLORER_BASE = (import.meta as any).env?.VITE_EXPLORER_BASE || ''

// Compute the same ID as backend (keccak256(repo, bytes32(commit)))
function toBytes32FromSha(sha: string): string {
  let hex = sha?.startsWith('0x') ? sha.slice(2) : sha || ''
  if (hex.length === 64) return '0x' + hex
  return ethers.keccak256(ethers.toUtf8Bytes(sha || ''))
}
function computeId(repo: string, commitHashBytes32: string): string {
  return ethers.solidityPackedKeccak256(['string','bytes32'], [repo, commitHashBytes32])
}

export default function MyPRs() {
  const { wallet } = useUser()
  const [token, setToken] = useState<string>(() => localStorage.getItem('gh_token') || '')
  const [me, setMe] = useState<any>(null)
  const [repo, setRepo] = useState('')
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [contribs, setContribs] = useState<Record<string, any>>({})
  const [errorText, setErrorText] = useState('')

  const explorer = useMemo(() => (EXPLORER_BASE || '').replace(/\/$/, ''), [])

  useEffect(() => {
    if (!token) return
    githubMe(token).then(setMe).catch(() => {})
  }, [token])

  useEffect(() => {
    if (!wallet) return
    listContributions(wallet).then((rows) => {
      const m: Record<string, any> = {}
      rows.forEach((r: any) => { m[r.id] = r })
      setContribs(m)
    }).catch(()=>{})
  }, [wallet])

  async function load() {
    try {
      setErrorText('')
      if (!token) {
        setErrorText('Please sign in with GitHub to view your pull requests.')
        toast.error('Sign in with GitHub first')
        return
      }
      if (!repo.includes('/')) {
        setErrorText('Enter repository as owner/name (for example, octocat/Hello-World).')
        toast.error('Enter repo as owner/name')
        return
      }
      setLoading(true)
      const rows = await githubMyPRs({ repo, state: 'all', merged: true, per_page: 50, page: 1 }, token)
      setItems(rows)
      // Also refresh contributions mapping so new registrations show immediately
      if (wallet) {
        try {
          const list = await listContributions(wallet)
          const m: Record<string, any> = {}
          list.forEach((r: any) => { m[r.id] = r })
          setContribs(m)
        } catch {}
      }
    } catch (e: any) {
      const status = e?.response?.status
      if (status === 401) {
        setErrorText("Not allowed: please sign in with GitHub to view your PRs.")
      } else if (status === 403) {
        setErrorText("Access denied or private repository. You can only see PRs you authored; ensure the repo is public or your token has access.")
      } else {
        setErrorText(e?.response?.data?.error || e.message || 'Failed to load PRs')
      }
      toast.error(e?.message || 'Failed to load PRs')
    } finally { setLoading(false) }
  }

  async function claimFor(pr: any) {
    try {
      if (!REGISTRY_ADDRESS) return toast.error('Missing VITE_REGISTRY_ADDRESS')
      const id = computeId(repo, toBytes32FromSha(pr.merge_commit_sha || pr.head_sha || ''))
      const match = contribs[id]
      if (!match) return toast.error('No registered contribution for this PR')
      const eth = (window as any).ethereum
      if (!eth) return toast.error('No wallet')
      const provider = new ethers.BrowserProvider(eth)
      await provider.send('eth_requestAccounts', [])
      const signer = await provider.getSigner()
      const abi = ['function claimReward(bytes32 id) external']
      const c = new ethers.Contract(REGISTRY_ADDRESS, abi, signer)
      const tx = await c.claimReward(id, { gasLimit: 200000n })
      const rec = await tx.wait()
      try { await fetch(`${API_BASE}/claim/mark`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, txHash: rec?.hash || tx.hash }) }) } catch {}
      toast.success('Claimed! ' + (rec?.hash || tx.hash))
      // refresh contributions mapping
      if (wallet) {
        const rows = await listContributions(wallet)
        const m: Record<string, any> = {}
        rows.forEach((r: any) => { m[r.id] = r })
        setContribs(m)
      }
    } catch (e: any) {
      toast.error(e.message || 'Claim failed')
    }
  }

  function loginGithub() {
    window.location.href = `${API_BASE}/auth/github/start`
  }

  return (
    <main className="max-w-6xl mx-auto px-4 pt-24">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">My Pull Requests</h2>
        <div className="flex items-center gap-2">
          <WalletConnectButton />
          {!token ? (
            <button onClick={loginGithub} className="px-3 py-2 rounded-md border border-white/10 hover:border-white/20 text-sm">Sign in with GitHub</button>
          ) : (
            <div className="text-xs text-zinc-400">Signed in as <span className="text-white">{me?.login || '...'}</span></div>
          )}
        </div>
      </div>
      <div className="mt-4">
        <HelpTip title="About My PRs">
          <ul className="list-disc pl-5 space-y-1">
            <li>Sign in with GitHub, then enter a repository as <span className="text-white/90">owner/name</span>.</li>
            <li>Only PRs authored by your GitHub account are shown here — across any repository. You can’t browse someone else’s PRs on this page.</li>
            <li>PRs become claimable only after the repo owner registers them on-chain. Look for the <span className="text-emerald-200">Claimable</span> badge.</li>
            <li>If you see <span className="text-amber-200">Not registered</span>, the owner/verifier hasn’t added it yet—check back later.</li>
          </ul>
        </HelpTip>
      </div>
      <div className="glass rounded-xl p-6 mt-4">
        {/* Guidance / errors */}
        {!!errorText && (
          <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 text-red-200 p-3 text-sm" role="alert">
            {errorText}
            {!token && (
              <button onClick={loginGithub} className="ml-3 underline">Sign in with GitHub</button>
            )}
          </div>
        )}
        <div className="flex gap-3 items-center">
          <input className="w-full input-neon bg-card rounded-md px-4 py-3" placeholder="owner/name" value={repo} onChange={e=>setRepo(e.target.value)} />
          <button onClick={load} className="btn-neon">Load</button>
        </div>
        <div className="mt-6">
          {loading ? (
            <div className="space-y-2">{Array.from({length:6}).map((_,i)=>(<div key={i} className="h-10 bg-white/5 rounded animate-pulse"/>))}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-zinc-400">
                  <tr>
                    <th className="text-left py-2">#</th>
                    <th className="text-left py-2">Title</th>
                    <th className="text-left py-2">Merged</th>
                    <th className="text-left py-2">Claim</th>
                    <th className="text-left py-2">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => {
                    const repoName = (p as any).repo_full_name || repo
                    const id = computeId(repoName, toBytes32FromSha(p.merge_commit_sha || p.head_sha || ''))
                    const match = contribs[id]
                    return (
                      <tr key={p.id} className={`border-t border-white/5 ${match?.claimed ? 'opacity-60' : ''}`}>
                        <td className="py-2">{p.number}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <span>{p.title}</span>
                            {match ? (
                              match.claimed ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full border border-zinc-500/40 bg-zinc-500/10 text-zinc-200">Claimed</span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-200">Claimable</span>
                              )
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-400/30 bg-amber-500/10 text-amber-200">Not registered</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2">{p.merged_at ? new Date(p.merged_at).toLocaleString() : '—'}</td>
                        <td className="py-2">
                          {match ? (
                            <button onClick={() => claimFor(p)} disabled={match.claimed} className="px-3 py-1 rounded-md border border-white/10 hover:border-white/20 disabled:opacity-50">{match.claimed ? 'Claimed' : 'Claim'}</button>
                          ) : (
                            <span className="text-xs text-zinc-400">Not registered</span>
                          )}
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <a className="inline-flex items-center gap-1 hover:underline" href={p.html_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> PR</a>
                            <button onClick={() => { navigator.clipboard.writeText(id); toast.success('ID copied') }} className="p-1 rounded hover:bg-white/10"><Copy size={14} /></button>
                            {match?.tx_hash && (
                              <>
                                {EXPLORER_BASE && <a className="inline-flex items-center gap-1 hover:underline" href={`${explorer}/tx/${match.tx_hash}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Explorer</a>}
                                <a className="inline-flex items-center gap-1 hover:underline" href={`/tx/${match.tx_hash}`}><ExternalLink size={14} /> Local</a>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
