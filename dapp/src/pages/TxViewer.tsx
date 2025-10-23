import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ethers } from 'ethers'

const RPC_URL = import.meta.env.VITE_JSON_RPC_URL || 'http://localhost:8545'

export default function TxViewer() {
  const { hash } = useParams()
  const [data, setData] = useState<any>(null)
  const [status, setStatus] = useState<string>('')

  useEffect(() => {
    if (!hash) return
    ;(async () => {
      try {
        setStatus('Loading transaction...')
        const eth = (window as any).ethereum
        const provider = eth ? new ethers.BrowserProvider(eth) : new ethers.JsonRpcProvider(RPC_URL)
        const [tx, receipt] = await Promise.all([
          provider.getTransaction(hash),
          provider.getTransactionReceipt(hash)
        ])
        setData({ tx, receipt })
        setStatus('')
      } catch (e: any) {
        setStatus(e.message || 'Failed to load')
      }
    })()
  }, [hash])

  return (
    <main className="max-w-3xl mx-auto px-4 pt-24">
      <div className="glass rounded-xl p-6">
        <h2 className="text-xl font-semibold">Transaction</h2>
        {status && <div className="text-sm text-zinc-400 mt-2">{status}</div>}
        {data && (
          <div className="mt-4 space-y-2 text-sm">
            <Row k="Hash" v={data.tx?.hash} mono />
            <Row k="Status" v={statusText(data.receipt)} />
            <Row k="Block" v={data.receipt?.blockNumber} />
            <Row k="From" v={data.tx?.from} mono />
            <Row k="To" v={data.tx?.to} mono />
            <Row k="Value" v={formatEth(data.tx?.value)} />
            <Row k="Gas Used" v={data.receipt?.gasUsed?.toString()} />
            <Row k="Logs" v={data.receipt?.logs?.length} />
          </div>
        )}
      </div>
    </main>
  )
}

function Row({ k, v, mono }: { k: string; v: any; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="w-28 text-zinc-400">{k}</div>
      <div className={mono ? 'font-mono break-all' : ''}>{String(v ?? '—')}</div>
    </div>
  )
}

function statusText(receipt: any) {
  if (!receipt) return '—'
  if (receipt.status === 1 || receipt.status === '0x1') return 'Success'
  if (receipt.status === 0 || receipt.status === '0x0') return 'Failed'
  return String(receipt.status)
}

function formatEth(v: any) {
  try { return v ? `${ethers.formatEther(v)} ETH` : '0' } catch { return String(v ?? '—') }
}
