import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { Link } from 'react-router-dom'
import HelpTip from '../components/HelpTip'

const RPC_URL = import.meta.env.VITE_JSON_RPC_URL || 'http://localhost:8545'
const REGISTRY_ADDRESS = import.meta.env.VITE_REGISTRY_ADDRESS
const ABI = [
  'event ContributionRegistered(bytes32 indexed id, address indexed beneficiary, string repo, bytes32 commitHash, string evidenceURI, uint256 reward, uint8 payoutMode, address token, address indexed registrar)',
  'event RewardClaimed(bytes32 indexed id, address indexed beneficiary, uint256 amount, uint8 payoutMode, address token)'
]

export default function Events() {
  const [items, setItems] = useState<any[]>([])
  const [status, setStatus] = useState('')

  useEffect(() => { load().catch(()=>{}) }, [])

  async function load() {
    if (!REGISTRY_ADDRESS) {
      setStatus('Missing VITE_REGISTRY_ADDRESS')
      return
    }
    setStatus('Loading events…')
    try {
      const eth = (window as any).ethereum
      const provider = eth ? new ethers.BrowserProvider(eth) : new ethers.JsonRpcProvider(RPC_URL)
      const iface = new ethers.Interface(ABI)
      // Query last ~5000 blocks for demo
      const head = await provider.getBlockNumber()
      const fromBlock = Math.max(0, head - 5000)
      const logs = await provider.getLogs({ address: REGISTRY_ADDRESS, fromBlock, toBlock: head })
      const parsed = logs.map(l => ({
        ...l,
        parsed: (()=>{ try { return iface.parseLog({ topics: l.topics as string[], data: l.data }) } catch { return null } })()
      })).filter(x => x.parsed)
      setItems(parsed.reverse())
      setStatus('')
    } catch (e: any) {
      setStatus(e.message || 'Failed to load')
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-4 pt-24">
      <div className="mb-4">
        <HelpTip title="What am I looking at?">
          <p>
            This page shows on-chain registry events. When a pull request passes verification, the
            contract emits a <span className="font-mono">ContributionRegistered</span> event. When a contributor
            claims a reward, it emits <span className="font-mono">RewardClaimed</span>.
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Use Refresh to re-scan the last ~5,000 blocks.</li>
            <li>Type shows the event name; ID is the contribution identifier; Beneficiary is the wallet paid.</li>
            <li>Click View to open a local transaction viewer; if an explorer is configured you’ll see a link there too.</li>
          </ul>
        </HelpTip>
      </div>
      <div className="glass rounded-xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Registry Events</h2>
          <button onClick={load} className="btn-neon">Refresh</button>
        </div>
        {status && <div className="text-sm text-zinc-400 mt-2">{status}</div>}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-zinc-400">
              <tr>
                <th className="text-left py-2">Type</th>
                <th className="text-left py-2">ID</th>
                <th className="text-left py-2">Beneficiary</th>
                <th className="text-left py-2">Tx</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const name = it.parsed?.name
                const args = it.parsed?.args as any[]
                const id = name === 'ContributionRegistered' ? args?.[0] : name === 'RewardClaimed' ? args?.[0] : null
                const beneficiary = name === 'ContributionRegistered' ? args?.[1] : name === 'RewardClaimed' ? args?.[1] : null
                return (
                  <tr key={idx} className="border-t border-white/5">
                    <td className="py-2">{name}</td>
                    <td className="py-2 font-mono text-xs">{id || '—'}</td>
                    <td className="py-2 font-mono text-xs">{beneficiary || '—'}</td>
                    <td className="py-2">
                      <Link to={`/tx/${it.transactionHash}`} className="hover:underline">View</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
