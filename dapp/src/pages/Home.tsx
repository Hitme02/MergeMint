import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useRef } from 'react'
import { Github, Wallet2, GitMerge, ShieldCheck, Blocks, Link2, Coins, Sparkles } from 'lucide-react'

const steps = [
  {
    title: 'Connect GitHub',
    desc: 'Start by logging in with your GitHub account.',
    Icon: Github,
  },
  {
    title: 'Bind Wallet',
    desc: 'Link your wallet to your GitHub identity to receive rewards.',
    Icon: Wallet2,
  },
  {
    title: 'Contribute & Merge PR',
    desc: 'Work on pull requests — when merged, they’re automatically verified.',
    Icon: GitMerge,
  },
  {
    title: 'Backend Verifies',
    desc: 'The verifier checks your contribution policy (LOC, thresholds, repo rules).',
    Icon: ShieldCheck,
  },
  {
    title: 'Register On-Chain',
    desc: 'Each verified PR is stored permanently on the blockchain.',
    Icon: Blocks,
  },
  {
    title: 'Claim Rewards',
    desc: 'Claim your earnings directly — either in ETH or ERC-20 tokens.',
    Icon: Coins,
  },
]

export default function Home() {
  const timelineRef = useRef<HTMLDivElement>(null)
  const scrollToTimeline = () => timelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <main className="max-w-6xl mx-auto px-4 pt-24">
      {/* Hero */}
      <div className="relative rounded-2xl glass p-10 overflow-hidden">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-emerald-300 via-emerald-400 to-violet-400 bg-clip-text text-transparent">MergeMint</span>: Rewarding GitHub contributions — on-chain.
          </h1>
          <p className="mt-4 text-zinc-300 max-w-2xl">
            A simple path from merged PRs to crypto rewards. Transparent. Verifiable. Fast.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <button onClick={scrollToTimeline} className="btn-neon inline-flex items-center gap-2">
              Get Started <Sparkles size={16} />
            </button>
            <Link to="/login" className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-white/10 hover:border-white/20 transition">
              Go to Login
            </Link>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 1.2 }}
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(124,58,237,0.15),transparent_60%)]"/>
      </div>

      {/* Timeline */}
      <section ref={timelineRef} className="mt-14">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold">How it works</h2>
          <p className="text-zinc-400">Six simple steps from GitHub to rewards.</p>
        </div>

        {/* vertical timeline for mobile, grid for desktop */}
        <div className="relative">
          {/* vertical glowing line on mobile */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-gradient-to-b from-fuchsia-500/40 via-purple-500/20 to-transparent md:hidden"/>

          <div className="grid md:grid-cols-3 gap-4">
            {steps.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.45, delay: i * 0.06 }}
                className="relative glass rounded-xl p-5 md:p-6 card-hover"
              >
                {/* connector dot for mobile */}
                <div className="md:hidden absolute -left-[6px] top-6 h-3 w-3 rounded-full bg-fuchsia-400 shadow-[0_0_14px_2px_rgba(232,121,249,0.7)]"/>

                <div className="flex items-start gap-3">
                  <div className="shrink-0 p-2 rounded-lg bg-white/5 border border-white/10 text-fuchsia-300">
                    <s.Icon size={20} />
                  </div>
                  <div>
                    <div className="font-semibold">{s.title}</div>
                    <div className="text-sm text-zinc-400 mt-1">{s.desc}</div>
                  </div>
                </div>
                {/* subtle gradient underline */}
                <div className="mt-4 h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent"/>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <div className="mt-12 grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 glass rounded-xl p-6 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">Ready to contribute?</div>
            <div className="text-sm text-zinc-400">Log in and start earning from your merged PRs.</div>
          </div>
          <Link to="/login" className="btn-neon">Go to Login</Link>
        </div>
        <div className="glass rounded-xl p-6">
          <div className="text-xs text-zinc-400">Quick facts</div>
          <ul className="mt-2 text-sm space-y-1 text-zinc-300">
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span> On-chain registry of verified PRs</li>
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400"></span> Native or ERC-20 rewards</li>
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-sky-400"></span> Wallet-bound to your GitHub identity</li>
          </ul>
        </div>
      </div>
    </main>
  )
}
