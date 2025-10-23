import { useEffect, useState } from 'react'
import WalletConnectButton from '../components/WalletConnectButton'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import { useUser } from '../context/UserContext'
import HelpTip from '../components/HelpTip'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
const REGISTRY_ADDRESS = import.meta.env.VITE_REGISTRY_ADDRESS
const EXPLORER_BASE = import.meta.env.VITE_EXPLORER_BASE || ''

export default function OwnerPool() {
  const { wallet } = useUser()
  const [balanceWei, setBalanceWei] = useState<string>('0')
  const [walletAddress, setWalletAddress] = useState<string>('')
  const [walletBalanceWei, setWalletBalanceWei] = useState<bigint>(0n)
  const [chainId, setChainId] = useState<bigint | null>(null)
  const [clientVersion, setClientVersion] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [amountEth, setAmountEth] = useState('0.1')

  async function refresh() {
    try {
      setLoading(true)
      const res = await fetch(`${API}/contract/stats`)
      const j = await res.json()
      setBalanceWei(j.nativeBalance || '0')
    } catch (e: any) {
      toast.error(e.message || 'Failed to load stats')
    } finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  async function refreshWallet() {
    try {
      const eth = (window as any).ethereum
      if (!eth) return
      const provider = new ethers.BrowserProvider(eth)
      const accounts = await provider.send('eth_accounts', [])
      if (!accounts?.[0]) return
      const addr = ethers.getAddress(accounts[0])
      setWalletAddress(addr)
      const bal = await provider.getBalance(addr)
      setWalletBalanceWei(bal)
      try {
        const net = await provider.getNetwork()
        setChainId(net.chainId)
      } catch {}
      try {
        const v = await provider.send('web3_clientVersion', [])
        if (typeof v === 'string') setClientVersion(v)
      } catch {}
    } catch {}
  }

  useEffect(() => { refreshWallet() }, [wallet])

  // ---- Formatting helpers to keep numbers compact and avoid layout overflow ----
  function formatEthPretty(weiLike: bigint | string, maxDecimals = 4): string {
    try {
      const v = typeof weiLike === 'bigint' ? weiLike : BigInt(String(weiLike))
      const eth = ethers.formatEther(v) // string
      const [i, f = ''] = eth.split('.')
      const intStr = Number.isSafeInteger(Number(i)) ? Number(i).toLocaleString() : i
      const frac = f.slice(0, maxDecimals).replace(/0+$/, '')
      return frac ? `${intStr}.${frac}` : intStr
    } catch {
      // For string inputs like "0" (or unexpected), fall back to plain display
      try {
        const eth = ethers.formatEther(weiLike as any)
        const [i, f = ''] = eth.split('.')
        const intStr = Number.isSafeInteger(Number(i)) ? Number(i).toLocaleString() : i
        const frac = f.slice(0, maxDecimals).replace(/0+$/, '')
        return frac ? `${intStr}.${frac}` : intStr
      } catch {
        return String(weiLike)
      }
    }
  }

  function shortenMiddle(s: string, keep = 8): string {
    const str = String(s)
    if (str.length <= keep * 2 + 1) return str
    return `${str.slice(0, keep)}…${str.slice(-keep)}`
  }

  function coalesceError(e: any): string {
    const parts: string[] = []
    if (e?.shortMessage) parts.push(e.shortMessage)
    if (e?.message) parts.push(e.message)
    // Common MetaMask / RPC nesting locations
    const nested = e?.info?.error || e?.error || e?.cause || e?.data || e?.response
    if (nested?.message) parts.push(nested.message)
    if (nested?.data?.message) parts.push(nested.data.message)
    if (nested?.data?.originalError?.message) parts.push(nested.data.originalError.message)
    // Fallback: stringified
    if (parts.length === 0) {
      try { parts.push(JSON.stringify(e)) } catch {}
    }
    return parts.filter(Boolean).join(': ')
  }

  async function deposit() {
    try {
      if (!REGISTRY_ADDRESS) return toast.error('Missing VITE_REGISTRY_ADDRESS')
      const eth = (window as any).ethereum
      if (!eth) return toast.error('No wallet')
      const provider = new ethers.BrowserProvider(eth)
      await provider.send('eth_requestAccounts', [])
      // Ensure correct network (Hardhat 31337 by default). If not present, try to add it.
      const network = await provider.getNetwork()
      if (network.chainId !== 31337n) {
        try {
          await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x7a69' /* 31337 */ }] })
        } catch (switchErr: any) {
          // 4902 = unknown chain, try to add
          if (switchErr?.code === 4902 || (switchErr?.data && String(switchErr.data).includes('Unrecognized chain ID'))) {
            try {
              await eth.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: '0x7a69',
                  chainName: 'Local Hardhat',
                  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                  rpcUrls: [import.meta.env.VITE_JSON_RPC_URL || 'http://localhost:8545'],
                  blockExplorerUrls: (import.meta.env.VITE_EXPLORER_BASE ? [import.meta.env.VITE_EXPLORER_BASE] : [])
                }]
              })
              await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x7a69' }] })
            } catch (addErr: any) {
              return toast.error('Please add/switch to the Local Hardhat network (chainId 31337)')
            }
          } else {
            return toast.error('Please switch to the Local Hardhat network (chainId 31337) in your wallet')
          }
        }
      }

      // Sanity check: ensure wallet is actually connected to a Hardhat node
      try {
        const v = await provider.send('web3_clientVersion', [])
        if (typeof v === 'string' && !/hardhat/i.test(v)) {
          toast((t)=> (
            <div>
              <div className="font-semibold">Wallet RPC might be wrong</div>
              <div className="text-sm opacity-80">Expected a Hardhat node at http://localhost:8545. Please edit the network in your wallet to use that URL.</div>
              <button className="btn-secondary mt-2" onClick={() => toast.dismiss(t.id)}>Dismiss</button>
            </div>
          ), { duration: 7000 })
        }
      } catch {}

      const signer = await provider.getSigner()
      const value = ethers.parseEther(amountEth || '0')
      const from = await signer.getAddress()
      // Preflight: ensure balance covers value + fee
      const [bal, fee] = await Promise.all([
        provider.getBalance(from),
        provider.getFeeData()
      ])
      const maxFeePerGas = fee.maxFeePerGas ?? fee.gasPrice ?? 0n
      // Pre-estimate gas and add a buffer to avoid underestimation on some wallets
      const est = await provider.estimateGas({ to: REGISTRY_ADDRESS, value, from })
      const gasLimit = est + 2_000n < 30_000n ? 30_000n : est + 2_000n // ensure at least ~30k
      const totalCost = value + (maxFeePerGas * gasLimit)
      if (bal < totalCost) {
        const need = ethers.formatEther(totalCost - bal)
        return toast.error(`Insufficient funds: need ~${need} ETH for value + gas`)
      }

      // Provide a safe gasLimit to avoid wallet choosing an intrinsic-gas-too-low value
      const tx = await signer.sendTransaction({ to: REGISTRY_ADDRESS, value, gasLimit })
      toast.success('Deposit sent: ' + tx.hash)
      await tx.wait()
      toast.success('Deposit confirmed')
      await refresh()
      await refreshWallet()
    } catch (e: any) {
      const msg = coalesceError(e) || 'Deposit failed'
      console.error('[deposit] error', e)
      toast.error(msg)
    }
  }

  const balanceEth = (() => {
    try { return formatEthPretty(balanceWei) } catch { return '0' }
  })()

  return (
    <main className="max-w-4xl mx-auto px-4 pt-24 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Reward Pool</h2>
        <WalletConnectButton />
      </div>
      <HelpTip title="Fund the registry with ETH">
        <p>
          The reward pool is simply the registry contract’s ETH balance. Depositing here gives the
          contract funds to pay claims. You can always open the address in an explorer to verify
          the balance.
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Enter an amount and click Deposit to send ETH from your connected wallet.</li>
          <li>On local chains, you can also fund the contract during deployment.</li>
        </ul>
      </HelpTip>
      <div className="glass rounded-xl p-6">
        <div className="text-sm text-zinc-400">Registry Address</div>
        <div className="font-mono text-lg mt-1 truncate" title={REGISTRY_ADDRESS || '—'}>
          {REGISTRY_ADDRESS || '—'}
        </div>
        {EXPLORER_BASE && REGISTRY_ADDRESS && (
          <a className="text-sm text-zinc-300 hover:underline" href={`${EXPLORER_BASE.replace(/\/$/, '')}/address/${REGISTRY_ADDRESS}`} target="_blank" rel="noreferrer">Open in Explorer</a>
        )}
        <div className="mt-2 text-xs text-zinc-400">
          Connected chain: {chainId ? String(chainId) : '—'}{chainId === 31337n ? ' (expected)' : chainId ? ' (switch to 31337)' : ''} • Client: {clientVersion || '—'}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="glass p-4 rounded-md">
            <div className="text-xs text-zinc-400">Native Balance</div>
            <div className="text-xl mt-1 flex items-baseline gap-2 overflow-hidden whitespace-nowrap">
              <span className="font-mono truncate max-w-[16ch]">{balanceEth}</span>
              <span className="text-zinc-400 text-sm">ETH</span>
              <span className="text-zinc-500 text-xs">({shortenMiddle(String(balanceWei), 8)} wei)</span>
            </div>
          </div>
          <div className="glass p-4 rounded-md">
            <div className="text-xs text-zinc-400 mb-1">Deposit ETH to Registry</div>
            <div className="flex gap-2">
              <input className="w-full input-neon bg-card rounded-md px-3 py-2" value={amountEth} onChange={e=>setAmountEth(e.target.value)} />
              <button onClick={deposit} disabled={!wallet || loading} className="btn-neon disabled:opacity-50">Deposit</button>
            </div>
            {!wallet && <div className="text-xs text-amber-400 mt-1">Connect a wallet first.</div>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="glass p-4 rounded-md">
            <div className="text-xs text-zinc-400">Your Wallet</div>
            <div className="mt-1 text-sm font-mono truncate" title={walletAddress || '—'}>{walletAddress || '—'}</div>
            <div className="text-xs text-zinc-400 mt-2">Wallet Balance</div>
            <div className="text-base mt-1 flex items-baseline gap-2 overflow-hidden whitespace-nowrap">
              <span className="font-mono truncate max-w-[16ch]">{formatEthPretty(walletBalanceWei || 0n, 6)}</span>
              <span className="text-zinc-400 text-sm">ETH</span>
              <span className="text-zinc-500 text-xs">({shortenMiddle(walletBalanceWei.toString(), 8)} wei)</span>
            </div>
          </div>
          <div className="glass p-4 rounded-md">
            <div className="text-xs text-zinc-400 mb-1">Local Dev Helpers</div>
            <div className="flex gap-2">
              <button
                className="btn-secondary"
                onClick={async () => {
                  try {
                    const eth = (window as any).ethereum
                    if (!eth) return toast.error('No wallet')
                    const provider = new ethers.BrowserProvider(eth)
                    const signer = await provider.getSigner()
                    const addr = await signer.getAddress()
                    // Ensure on local Hardhat chain
                    const net = await provider.getNetwork()
                    if (net.chainId !== 31337n) return toast.error('Switch to Local Hardhat (31337) first')
                    const amount = ethers.parseEther('10')
                    await provider.send('hardhat_setBalance', [addr, ethers.toBeHex(amount)])
                    // Mine a block so balance updates in some wallets
                    try { await provider.send('hardhat_mine', ['0x1']) } catch {}
                    toast.success('Funded 10 ETH')
                    await refreshWallet()
                  } catch (e: any) {
                    console.error('[faucet] error', e)
                    toast.error(coalesceError(e) || 'Faucet failed')
                  }
                }}
              >Get 10 ETH (local)</button>
              <button
                className="btn-secondary"
                onClick={async () => {
                  try {
                    const resp = await fetch(`${API}/dev/contract/fund-native`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountEth: amountEth || '0.1' }) })
                    const j = await resp.json()
                    if (!resp.ok) {
                      return toast.error(`Backend fund failed: ${j?.error || resp.status}`)
                    }
                    toast.success('Backend fund tx: ' + j.hash)
                    await refresh()
                  } catch (e: any) {
                    console.error('[backend-fund] error', e)
                    toast.error(coalesceError(e) || 'Backend fund failed')
                  }
                }}
              >Fund via Backend (dev)</button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
