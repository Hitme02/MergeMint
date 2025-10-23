import { createContext, useContext, useEffect, useState } from 'react'

type Role = 'owner' | 'contributor' | null

type Ctx = {
  role: Role
  setRole: (r: Role) => void
  wallet: string
  setWallet: (a: string) => void
  ghToken: string
  setGhToken: (t: string) => void
  username: string
  setUsername: (u: string) => void
  authed: boolean
  setAuthed: (v: boolean) => void
  authExp: number
  setAuthExp: (ts: number) => void
}

const UserCtx = createContext<Ctx | undefined>(undefined)

export function UserProvider({ children }: { children: any }) {
  const [role, setRoleState] = useState<Role>(() => (localStorage.getItem('role') as Role) || null)
  const [wallet, setWalletState] = useState<string>(() => localStorage.getItem('wallet') || '')
  const [ghToken, setGhTokenState] = useState<string>(() => localStorage.getItem('gh_token') || '')
  const [username, setUsernameState] = useState<string>(() => localStorage.getItem('username') || '')
  const [authed, setAuthedState] = useState<boolean>(() => localStorage.getItem('authed') === 'true')
  const [authExp, setAuthExpState] = useState<number>(() => Number(localStorage.getItem('auth_exp') || '0'))

  const setRole = (r: Role) => { setRoleState(r); r ? localStorage.setItem('role', r) : localStorage.removeItem('role') }
  const setWallet = (a: string) => { setWalletState(a); a ? localStorage.setItem('wallet', a) : localStorage.removeItem('wallet') }
  const setGhToken = (t: string) => { setGhTokenState(t); t ? localStorage.setItem('gh_token', t) : localStorage.removeItem('gh_token') }
  const setUsername = (u: string) => { setUsernameState(u); u ? localStorage.setItem('username', u) : localStorage.removeItem('username') }
  const setAuthed = (v: boolean) => { setAuthedState(v); localStorage.setItem('authed', v ? 'true' : 'false') }
  const setAuthExp = (ts: number) => { setAuthExpState(ts); ts ? localStorage.setItem('auth_exp', String(ts)) : localStorage.removeItem('auth_exp') }

  // Auto-logout when expired
  useEffect(() => {
    const id = setInterval(() => {
      const ts = Number(localStorage.getItem('auth_exp') || '0')
      if (authed && ts && Date.now() > ts) {
        setAuthed(false)
        setRole(null)
        setGhToken('')
        setUsername('')
        setWallet('')
        localStorage.removeItem('owner_token')
      }
    }, 60000)
    return () => clearInterval(id)
  }, [authed])

  return <UserCtx.Provider value={{ role, setRole, wallet, setWallet, ghToken, setGhToken, username, setUsername, authed, setAuthed, authExp, setAuthExp }}>{children}</UserCtx.Provider>
}

export function useUser() {
  const v = useContext(UserCtx)
  if (!v) throw new Error('UserContext not found')
  return v
}
