import { BookOpen, Boxes, Coins, GitPullRequest, HandCoins, KeyRound, ShieldCheck, Wallet, Workflow, Zap, Bug, Wrench, RefreshCw } from 'lucide-react'

function GlowHeader({ icon: Icon, children }: { icon: any; children: any }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="p-2 rounded-md bg-white/5 ring-1 ring-white/10 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.25)]"><Icon size={16} /></div>
      <h3 className="text-lg font-semibold tracking-wide drop-shadow-[0_1px_6px_rgba(16,185,129,0.35)]">{children}</h3>
    </div>
  )
}

function SoftCard({ children, className = '' }: { children: any; className?: string }) {
  return <div className={`glass rounded-xl p-5 ${className}`}>{children}</div>
}

function Step({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <div className="relative pl-10">
      <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-emerald-400/20 ring-1 ring-emerald-300/40 flex items-center justify-center text-emerald-300">
        <Icon size={14} />
      </div>
      <div className="text-white/90 font-medium">{title}</div>
      <div className="text-sm text-zinc-300 mt-0.5 leading-relaxed">{body}</div>
    </div>
  )
}

export default function Help() {
  return (
    <main className="max-w-6xl mx-auto px-4 pt-24 space-y-8">
      {/* Intro */}
      <SoftCard>
        <div className="flex items-start gap-4">
          <div className="p-2 rounded-md bg-white/5 ring-1 ring-white/10 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.25)]"><Zap size={18} /></div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight drop-shadow-[0_1px_8px_rgba(59,130,246,0.25)]">Welcome</h2>
            <p className="text-zinc-300 mt-1 leading-relaxed">Rewarding merged GitHub pull requests — on-chain. This guide highlights the core ideas and shows where to click next.</p>
          </div>
        </div>
      </SoftCard>

      {/* Key Concepts */}
      <SoftCard>
        <GlowHeader icon={BookOpen}>Key Concepts</GlowHeader>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex items-start gap-2"><Boxes size={16} className="mt-0.5 text-emerald-300" /><p><b>Registry</b> — the contract that records contributions and pays rewards.</p></div>
            <div className="flex items-start gap-2"><Coins size={16} className="mt-0.5 text-emerald-300" /><p><b>Native</b> — rewards in ETH (or chain currency) when payout mode is NATIVE.</p></div>
            <div className="flex items-start gap-2"><HandCoins size={16} className="mt-0.5 text-emerald-300" /><p><b>ERC20</b> — rewards in a configured token for the repo.</p></div>
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-2"><ShieldCheck size={16} className="mt-0.5 text-emerald-300" /><p><b>Verifier</b> — backend signer that validates PRs and can register on-chain.</p></div>
            <div className="flex items-start gap-2"><GitPullRequest size={16} className="mt-0.5 text-emerald-300" /><p><b>Contribution ID</b> — <span className="font-mono">keccak256(repo, bytes32(commit))</span> uniquely identifies a merged PR.</p></div>
            <div className="flex items-start gap-2"><Wallet size={16} className="mt-0.5 text-emerald-300" /><p><b>Bind</b> — link your wallet to your GitHub so rewards go to the right address.</p></div>
          </div>
        </div>
      </SoftCard>

      {/* Typical Flows */}
      <SoftCard>
        <GlowHeader icon={Workflow}>Typical Flows</GlowHeader>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-5">
            <Step icon={KeyRound} title="1) Sign in & bind" body="Use GitHub OAuth and connect your wallet so the app can attribute rewards to you." />
            <Step icon={GitPullRequest} title="2) Merge a PR" body="The verifier checks policy (e.g. LOC threshold), stores evidence, and may register on-chain." />
            <Step icon={Coins} title="3) Claim reward" body="Once registered, claim from the registry. ETH or ERC20 is sent directly to your wallet." />
          </div>
          <div className="space-y-5">
            <Step icon={Wrench} title="Owner: configure repo" body="Set payout mode, reward, and rules (min LOC) in Contract Settings." />
            <Step icon={RefreshCw} title="Owner: verify + register" body="Use Manage Verifier tools in dev to register any missing items or sync claims." />
            <Step icon={HandCoins} title="Owner: fund pool" body="Deposit ETH in Reward Pool so the registry can pay claims on-chain." />
          </div>
        </div>
      </SoftCard>

      {/* Two-column Owner/Contributor */}
      <div className="grid md:grid-cols-2 gap-6">
        <SoftCard>
          <GlowHeader icon={ShieldCheck}>Owner Pages</GlowHeader>
          <div className="grid gap-3 text-sm">
            <div className="p-3 rounded-md bg-white/5 ring-1 ring-white/10">
              <div className="font-medium">Dashboard</div>
              <div className="text-zinc-300">Registry address, balance, total contributions, and claimed counts.</div>
            </div>
            <div className="p-3 rounded-md bg-white/5 ring-1 ring-white/10">
              <div className="font-medium">Contract Settings</div>
              <div className="text-zinc-300">Min LOC, payout mode (Native/Token), reward amount, token address.</div>
            </div>
            <div className="p-3 rounded-md bg-white/5 ring-1 ring-white/10">
              <div className="font-medium">Manage Verifier</div>
              <div className="text-zinc-300">Dev helpers to register missing on-chain entries and sync claims.</div>
            </div>
            <div className="p-3 rounded-md bg-white/5 ring-1 ring-white/10">
              <div className="font-medium">Reward Pool</div>
              <div className="text-zinc-300">Deposit ETH into the registry to fund payouts and view explorer links.</div>
            </div>
            <div className="p-3 rounded-md bg-white/5 ring-1 ring-white/10">
              <div className="font-medium">Pull Requests</div>
              <div className="text-zinc-300">Query GitHub by repo/author or view on-chain events to cross-check status.</div>
            </div>
          </div>
        </SoftCard>
        <SoftCard>
          <GlowHeader icon={Wallet}>Contributor Pages</GlowHeader>
          <div className="grid gap-3 text-sm">
            <div className="p-3 rounded-md bg-white/5 ring-1 ring-white/10">
              <div className="font-medium">My PRs</div>
              <div className="text-zinc-300">After GitHub OAuth, enter a repo to list your merged PRs, match IDs, and claim.</div>
            </div>
            <div className="p-3 rounded-md bg-white/5 ring-1 ring-white/10">
              <div className="font-medium">Contributions</div>
              <div className="text-zinc-300">See all registered contributions for your wallet and claim directly.</div>
            </div>
            <div className="p-3 rounded-md bg-white/5 ring-1 ring-white/10">
              <div className="font-medium">Events</div>
              <div className="text-zinc-300">Recent registry events such as ContributionRegistered and RewardClaimed.</div>
            </div>
          </div>
        </SoftCard>
      </div>

      {/* Troubleshooting */}
      <SoftCard>
        <GlowHeader icon={Bug}>Troubleshooting</GlowHeader>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="p-3 rounded-md bg-white/5 ring-1 ring-white/10"><b>Can’t claim (NotBeneficiary)</b><div className="text-zinc-300">Ensure your wallet is bound to your GitHub and the contribution is registered for that wallet. Owners can run “Register Missing”.</div></div>
            <div className="p-3 rounded-md bg-white/5 ring-1 ring-white/10"><b>401 on GitHub PRs</b><div className="text-zinc-300">Sign in with GitHub on the page or set a server GITHUB_TOKEN with repo access (and SSO, if required).</div></div>
          </div>
          <div className="space-y-2">
            <div className="p-3 rounded-md bg-white/5 ring-1 ring-white/10"><b>RPC/gas errors</b><div className="text-zinc-300">A safe gasLimit is used for claims. If failures persist, check node health and registry funding.</div></div>
            <div className="p-3 rounded-md bg-white/5 ring-1 ring-white/10"><b>OAuth not configured</b><div className="text-zinc-300">Set GitHub OAuth env in backend and FRONTEND_ORIGIN. Dev helpers can be enabled for local testing.</div></div>
          </div>
        </div>
      </SoftCard>
    </main>
  )
}
