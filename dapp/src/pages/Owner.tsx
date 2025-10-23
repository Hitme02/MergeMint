import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ethers } from 'ethers'
import { useUser } from '../context/UserContext'
import HelpTip from '../components/HelpTip'
import { ownerSetupWebhook } from '../utils/api'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

export default function Owner() {
  const { wallet, setWallet } = useUser()
  const [token, setToken] = useState(localStorage.getItem('owner_token') || '')
  const [repo, setRepo] = useState('')
  const [schema, setSchema] = useState<any | null>(null)
  const [minLoc, setMinLoc] = useState(5)
  const [payoutMode, setPayoutMode] = useState<'NATIVE'|'ERC20'>('NATIVE')
  const [reward, setReward] = useState('1000000000000000')
  const [tokenAddress, setTokenAddress] = useState('')

  async function signIn() {
    try {
      const eth = (window as any).ethereum
      if (!eth) throw new Error('No wallet')
      const provider = new ethers.BrowserProvider(eth)
      await provider.send('eth_requestAccounts', [])
      const signer = await provider.getSigner()
      const addr = await signer.getAddress()
      setWallet(addr)
      const nres = await fetch(`${API}/auth/nonce`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet: addr })})
      const { messageToSign } = await nres.json()
      const signature = await signer.signMessage(messageToSign)
      const vres = await fetch(`${API}/auth/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet: addr, signature })})
      const vjson = await vres.json()
      if (!vres.ok) throw new Error(vjson.error || 'Auth failed')
      localStorage.setItem('owner_token', vjson.token)
      setToken(vjson.token)
      toast.success('Signed in')
    } catch (e: any) {
      toast.error(e.message || 'Sign-in failed')
    }
  }

  async function loadSchema() {
    if (!repo) return
    const res = await fetch(`${API}/owner/schema?repo=${encodeURIComponent(repo)}`)
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
    setSchema(j.schema)
    if (j.schema) {
      setMinLoc(j.schema.min_loc || 5)
      setPayoutMode((j.schema.payout_mode || 'NATIVE') as any)
      setReward(String(j.schema.reward || '1000000000000000'))
      setTokenAddress(j.schema.token_address || '')
    }
  }

  async function saveSchema() {
    try {
      if (!token) throw new Error('Sign in first')
      const gh = localStorage.getItem('gh_token') || ''
      if (!gh) throw new Error('Sign in with GitHub to verify repo permissions')
      const res = await fetch(`${API}/owner/schema`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-GitHub-Bearer': gh.startsWith('gh:') ? gh : `gh:${gh}`.replace(/^gh:gh:/,'gh:') },
        body: JSON.stringify({ repo, min_loc: minLoc, payout_mode: payoutMode, reward, token_address: tokenAddress || null })
      })
      const ct = res.headers.get('content-type') || ''
      const j = ct.includes('application/json') ? await res.json() : { error: await res.text().catch(() => 'non-json response') }
      if (!res.ok) throw new Error(j.error || 'Save failed')
      setSchema(j.schema)
      toast.success('Schema saved')
    } catch (e: any) {
      toast.error(e.message || 'Save failed')
    }
  }

  async function devGrantOwner() {
    try {
      if (!wallet) throw new Error('Connect wallet first')
      const res = await fetch(`${API}/dev/owner/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, repo: repo || null })
      })
      const ct = res.headers.get('content-type') || ''
      const j = ct.includes('application/json') ? await res.json() : { error: await res.text().catch(() => 'non-json response') }
      if (!res.ok) throw new Error(j.error || 'Grant failed')
      toast.success('Owner role granted for repo')
    } catch (e: any) {
      toast.error(e.message || 'Grant failed')
    }
  }

  async function setupWebhook() {
    try {
      if (!token) throw new Error('Sign in first')
      const gh = localStorage.getItem('gh_token') || ''
      if (!gh) throw new Error('Sign in with GitHub (owner)')
      if (!repo.includes('/')) throw new Error('Enter repo as owner/name')
      const res = await ownerSetupWebhook(repo, token, gh)
      toast.success(res.created ? 'Webhook created' : (res.updated ? 'Webhook updated' : 'Webhook ok'))
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e.message || 'Webhook setup failed')
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 pt-24">
      <div className="mb-4">
        <HelpTip title="Contract settings for a repo">
          <ol className="list-decimal pl-5 space-y-1">
            <li>Click Sign in to prove ownership (message-signing, no gas).</li>
            <li>Enter your repository as <span className="font-mono">owner/name</span> and Load to fetch the current policy.</li>
            <li>Edit the rules:
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li><b>Min LOC</b>: minimum lines changed to count a PR.</li>
                <li><b>Payout Mode</b>: NATIVE pays ETH; ERC20 pays your token (set its address).</li>
                <li><b>Reward</b>: amount per approved PR (wei for ETH or token units).</li>
              </ul>
            </li>
            <li>Click Save to persist the schema in the backend so new PRs are evaluated against it.</li>
          </ol>
          <div className="text-xs text-zinc-400 mt-2">Tip: “Grant Owner (Dev)” assigns your connected wallet as an owner in local dev.</div>
        </HelpTip>
      </div>
      <div className="glass rounded-xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Repo Owner — Reward Schema</h2>
          <button onClick={signIn} className="btn-neon">{token ? 'Re-auth' : 'Sign in'}</button>
        </div>
        <div className="mt-4 space-y-3">
          <input className="w-full input-neon bg-card rounded-md px-4 py-3" placeholder="owner/name" value={repo} onChange={e=>setRepo(e.target.value)} />
          <div className="flex gap-3">
            <button onClick={loadSchema} className="px-3 py-2 rounded-md border border-white/10">Load</button>
            <button onClick={saveSchema} className="btn-neon">Save</button>
            <button onClick={devGrantOwner} className="px-3 py-2 rounded-md border border-white/10">Grant Owner (Dev)</button>
            <button onClick={setupWebhook} className="px-3 py-2 rounded-md border border-white/10">Setup Webhook</button>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <label className="text-xs text-zinc-400">Min LOC</label>
              <input type="number" className="w-full input-neon bg-card rounded-md px-3 py-2" value={minLoc} onChange={e=>setMinLoc(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-zinc-400">Payout Mode</label>
              <select className="w-full input-neon bg-card rounded-md px-3 py-2" value={payoutMode} onChange={e=>setPayoutMode(e.target.value as any)}>
                <option value="NATIVE">NATIVE</option>
                <option value="ERC20">ERC20</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400">Reward (wei or token units)</label>
              <input className="w-full input-neon bg-card rounded-md px-3 py-2" value={reward} onChange={e=>setReward(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-zinc-400">Token Address (ERC20)</label>
              <input className="w-full input-neon bg-card rounded-md px-3 py-2" value={tokenAddress} onChange={e=>setTokenAddress(e.target.value)} />
            </div>
          </div>
          {schema && <div className="text-xs text-zinc-400 mt-2">Last updated by: <span className="font-mono">{schema.updated_by}</span></div>}
        </div>
      </div>
    </main>
  )
}
