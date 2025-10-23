import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { api, getNonce, verifyBind, devBind } from '../utils/api'
import { useLocation } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import HelpTip from '../components/HelpTip'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

export default function BindWallet() {
  const location = useLocation()
  const { setGhToken: setCtxToken, setUsername: setCtxUsername, setRole, setAuthed, setAuthExp } = useUser()
  const [username, setUsername] = useState(localStorage.getItem('username') || '')
  const [status, setStatus] = useState('')
  const [address, setAddress] = useState(localStorage.getItem('wallet') || '')
  const [oauthReady, setOauthReady] = useState(false)
  const [ghToken, setLocalGhToken] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const t = params.get('token') || ''
    const u = params.get('username') || ''
    if (t && u) {
      // Finish OAuth login: persist identity and role, then route to role area
  setLocalGhToken(t)
  setCtxToken(t)
      setCtxUsername(u)
  setUsername(u)
      try { localStorage.setItem('gh_token', t) } catch {}
      const pending = localStorage.getItem('pending_role') as any
      const role = (pending === 'owner' || pending === 'contributor') ? pending : 'contributor'
      setRole(role)
  setAuthed(true)
  try { setAuthExp(Date.now() + 12 * 60 * 60 * 1000) } catch {}
      toast.success('GitHub authenticated — finishing login…')
      setTimeout(() => {
        window.history.replaceState({}, '', window.location.pathname) // clear query
        window.location.href = role === 'owner' ? '/owner' : '/contributor'
      }, 600)
      return
    }
  }, [location.search])

  async function bindInjected() {
    try {
      setStatus('Requesting nonce...')
  const { nonce, messageToSign } = await getNonce(username)
      const eth = (window as any).ethereum
      if (!eth) throw new Error('No injected wallet found')
      const [acct] = await eth.request({ method: 'eth_requestAccounts' })
      const signature = await eth.request({ method: 'personal_sign', params: [messageToSign, acct] })
      setStatus('Verifying...')
  await verifyBind(username, signature, acct)
      localStorage.setItem('username', username)
      localStorage.setItem('wallet', acct)
      setAddress(acct)
      setStatus('')
      toast.success('Wallet bound to GitHub!')
    } catch (e: any) {
      toast.error(e.message || 'Bind failed')
      setStatus('')
    }
  }

  async function bindViaOAuth() {
    try {
      if (!ghToken) {
        // Kick off OAuth
        window.location.href = `${API}/auth/github/start`
        return
      }
      const eth = (window as any).ethereum
      if (!eth) throw new Error('No injected wallet found')
      const [acct] = await eth.request({ method: 'eth_requestAccounts' })
      setStatus('Attaching wallet...')
      const res = await fetch(`${API}/bind/attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ghToken}` },
        body: JSON.stringify({ wallet: acct })
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Attach failed')
      localStorage.setItem('username', j.username || username)
      localStorage.setItem('wallet', j.wallet || acct)
      setAddress(j.wallet || acct)
      setStatus('')
      toast.success('GitHub ↔ Wallet attached!')
    } catch (e: any) {
      toast.error(e.message || 'Attach failed')
      setStatus('')
    }
  }

  async function bindDev() {
    try {
      const acct = address || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
      await devBind(username, acct)
      localStorage.setItem('username', username)
      localStorage.setItem('wallet', acct)
      setAddress(acct)
      toast.success('Dev bind successful')
    } catch (e: any) {
      toast.error(e.message || 'Dev bind failed')
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 pt-24">
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}
        className="glass rounded-xl p-6 card-hover">
        <h2 className="text-2xl font-semibold">Bind GitHub ↔ Wallet</h2>
        <p className="text-sm text-zinc-400 mt-1">Enter your GitHub username, then bind with MetaMask or use the dev shortcut.</p>
        <div className="mt-4">
          <HelpTip title="How binding works">
            <ul className="list-disc pl-5 space-y-1">
              <li>Binding links your GitHub account to your wallet so you can claim rewards for your PRs.</li>
              <li>Click <span className="text-white/90">Bind (Injected)</span> to sign a message with your wallet. No funds are moved.</li>
              <li>No wallet? Use <span className="text-white/90">Sign in with GitHub</span> and then <span className="text-white/90">Attach Wallet</span>.</li>
              <li>After binding, your contributions will show up under <span className="text-white/90">Contributions</span> and <span className="text-white/90">My PRs</span>.</li>
            </ul>
          </HelpTip>
        </div>
        <div className="mt-5 space-y-3">
          <input className="w-full input-neon bg-card rounded-md px-4 py-3" placeholder="github username" value={username} onChange={e => setUsername(e.target.value)} />
          <div className="flex gap-3">
            <button onClick={bindInjected} className="btn-neon">Bind (Injected)</button>
            <button onClick={bindDev} className="px-4 py-2 rounded-md border border-white/10 hover:border-white/20 transition">Bind (Dev)</button>
            <button onClick={bindViaOAuth} className="px-4 py-2 rounded-md border border-white/10 hover:border-white/20 transition">
              {oauthReady ? 'Attach Wallet (GitHub)' : 'Sign in with GitHub'}
            </button>
          </div>
          {address && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-zinc-300 text-sm">
              Bound to: <span className="text-white font-mono">{address}</span>
            </motion.div>
          )}
          {status && <div className="text-xs text-zinc-400">{status}</div>}
        </div>
      </motion.div>
    </main>
  )
}
