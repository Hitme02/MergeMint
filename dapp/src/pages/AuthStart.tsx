import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

export default function AuthStart() {
  const [role, setRole] = useState<string>('')
  useEffect(() => { setRole(localStorage.getItem('pending_role') || 'contributor') }, [])

  function startOAuth() {
    window.location.href = `${API}/auth/github/start`
  }

  return (
    <main className="max-w-md mx-auto px-4 pt-24 text-center">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-8">
        <div className="text-3xl mb-2">Confirm Role</div>
        <div className="text-zinc-400 mb-4">You chose: <span className="text-white font-semibold">{role.toUpperCase()}</span></div>
        <button onClick={startOAuth} className="btn-neon">Login with GitHub</button>
      </motion.div>
    </main>
  )
}
