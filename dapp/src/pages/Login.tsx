import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useUser } from '../context/UserContext'

export default function Login() {
  const nav = useNavigate()
  const { authed } = useUser()
  useEffect(() => {
    if (authed) nav('/contributor')
  }, [authed])
  function choose(r: 'owner'|'contributor') {
    localStorage.setItem('pending_role', r)
    nav('/auth')
  }
  return (
    <main className="max-w-md mx-auto px-4 pt-24 text-center">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-8">
        <div className="text-3xl mb-2">⚡ GitHub On-Chain Rewards</div>
        <div className="text-zinc-400">Pick your role</div>
        <div className="mt-6 grid grid-cols-1 gap-3">
          <button className="btn-neon" onClick={() => choose('owner')}>Login as Owner 🔐</button>
          <button className="px-4 py-3 rounded-md border border-white/10 hover:border-white/20" onClick={() => choose('contributor')}>Login as Contributor 👨‍💻</button>
        </div>
      </motion.div>
    </main>
  )
}
