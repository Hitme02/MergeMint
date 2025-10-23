import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import { Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import WalletConnectButton from './WalletConnectButton'
import { useUser } from '../context/UserContext'

export default function Navbar() {
  const { scrollY } = useScroll()
  const bgOpacity = useTransform(scrollY, [0, 120], [0.2, 0.5])
  const bgColor = useTransform(bgOpacity, (o) => `rgba(12,16,24,${o})`)
  const blur = useTransform(scrollY, [0, 120], [2, 8])

  const { role, setRole, wallet, setWallet, authed, setAuthed, setGhToken, setUsername, username } = useUser()
  const loc = useLocation()
  const nav = useNavigate()
  const [walletConnected, setWalletConnected] = useState(false)

  useEffect(() => {
    // glow subtle on route change
  }, [loc.pathname])

  // Detect active wallet connection to decide if Bind should be disabled after binding
  useEffect(() => {
    const eth = (window as any)?.ethereum
    if (!eth) { setWalletConnected(false); return }
    eth.request({ method: 'eth_accounts' }).then((accts: string[]) => setWalletConnected(Array.isArray(accts) && accts.length > 0)).catch(() => setWalletConnected(false))
    const onAccounts = (accts: string[]) => setWalletConnected(Array.isArray(accts) && accts.length > 0)
    eth.on?.('accountsChanged', onAccounts)
    return () => { try { eth.removeListener?.('accountsChanged', onAccounts) } catch {}
    }
  }, [])

  function logout() {
    localStorage.removeItem('owner_token')
    localStorage.removeItem('role')
    localStorage.removeItem('wallet')
    localStorage.removeItem('gh_token')
    localStorage.removeItem('username')
    localStorage.removeItem('auth_exp')
    setRole(null)
    setWallet('')
    setGhToken('')
    setUsername('')
    setAuthed(false)
    toast.success('Logged out')
    nav('/login')
  }

  const isPublicHome = !authed && loc.pathname.startsWith('/home')

  // Build nav links based on auth and role. When logged out, show only Home.
  const leftLinks: Array<{ to: string; label: string; visible: boolean; disabled?: boolean; title?: string }> = [
    { to: '/home', label: 'Home', visible: true },
    // contributor-only
    { to: '/bind', label: 'Bind', visible: authed && role === 'contributor', disabled: !!username && !!wallet && !walletConnected, title: (!!username && !!wallet && !walletConnected) ? 'Already bound. Connect your wallet to manage binding.' : undefined },
    { to: '/contributions', label: 'Contributions', visible: authed && role === 'contributor' },
    { to: '/my-prs', label: 'My PRs', visible: authed && role === 'contributor' },
    // owner-only (role-specific)
    { to: '/events', label: 'Events', visible: authed && role === 'owner' },
    // owner-only
    { to: '/owner', label: 'Owner', visible: authed && role === 'owner' },
    // Help stays available always
    { to: '/help', label: 'Help', visible: true },
  ]

  return (
    <motion.nav style={{ backdropFilter: blur as any }} className="fixed top-0 left-0 right-0 z-50">
  <motion.div style={{ backgroundColor: bgColor as any }} className="w-full">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="group flex items-center gap-2" aria-label="MergeMint home">
              <div className="text-2xl leading-none">⚡</div>
              <span
                className="hidden sm:inline-block font-semibold bg-gradient-to-r from-emerald-300 via-emerald-400 to-violet-400 bg-clip-text text-transparent select-none transition duration-200 group-hover:brightness-110"
                style={{ animationDuration: '1.5s' }}
              >
                MergeMint
              </span>
            </Link>
            <div className="hidden sm:flex items-center gap-4 text-sm text-zinc-300">
              {leftLinks.filter(l => l.visible && (!isPublicHome || l.to === '/home' || l.to === '/help')).map((l) => (
                <NavLink key={l.to} to={l.to} disabled={!!l.disabled} title={l.title}>{l.label}</NavLink>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {authed ? (
              <>
                {role && <span className="text-xs px-2 py-1 rounded bg-white/10 uppercase">{role}</span>}
                <WalletConnectButton />
                <button onClick={logout} className="px-3 py-2 rounded-md border border-white/10 hover:border-white/20 text-sm">Logout</button>
              </>
            ) : (
              <button onClick={() => nav('/login')} className="px-3 py-2 rounded-md border border-white/10 hover:border-white/20 text-sm">Login</button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.nav>
  )
}

function NavLink({ to, children, disabled = false, title }: { to: string; children: any; disabled?: boolean; title?: string }) {
  const location = useLocation()
  const active = location.pathname === to
  const cls = `hover:text-white transition ${active ? 'text-white' : ''} ${disabled ? 'opacity-50 pointer-events-none cursor-not-allowed' : ''}`
  return <Link to={to} className={cls} aria-disabled={disabled} title={title}>{children}</Link>
}

// Also provide a named export for bundlers that fail default detection in some environments
export { Navbar as NavDefault }
