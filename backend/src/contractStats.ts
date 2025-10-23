import { Request, Response, Router } from 'express'
import { ethers } from 'ethers'
import { db } from './db'

export function mountContractStats(router: Router) {
  router.get('/contract/stats', async (_req: Request, res: Response) => {
    try {
      const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS
      const RPC_URL = process.env.RPC_URL
      const ENABLE_ONCHAIN = String(process.env.ENABLE_ONCHAIN || '').toLowerCase()
      if (!(ENABLE_ONCHAIN === 'true' || ENABLE_ONCHAIN === '1')) {
        return res.status(503).json({ error: 'chain_unavailable', hint: 'ENABLE_ONCHAIN is not true; enable and ensure RPC_URL/REGISTRY_ADDRESS are configured' })
      }
      if (!REGISTRY_ADDRESS || !RPC_URL) return res.status(400).json({ error: 'missing_env' })
      // Attempt a quick provider call with a short timeout; surface unavailability as 503
      const provider = new ethers.JsonRpcProvider(RPC_URL)
      let nativeBalance = '0'
      try {
        const ac = new AbortController()
        const t = setTimeout(() => ac.abort(), 2500)
        // ethers v6 doesn't take AbortSignal on getBalance; rely on provider-level timeout via race
        const bal = await Promise.race([
          provider.getBalance(REGISTRY_ADDRESS),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500))
        ])
        // @ts-ignore - bal only resolves if getBalance returns
        nativeBalance = bal.toString()
        clearTimeout(t)
      } catch (e: any) {
        const message = e?.message || String(e)
        return res.status(503).json({ error: 'chain_unavailable', details: message })
      }
      const { rows: counts } = await db.query(`
        SELECT COUNT(*)::int as total, COALESCE(SUM(CASE WHEN payout_mode='NATIVE' THEN reward ELSE 0 END),0) as total_native,
               SUM(CASE WHEN claimed THEN 1 ELSE 0 END)::int as claimed
        FROM contributions`)
      res.json({
        registryAddress: REGISTRY_ADDRESS,
        nativeBalance,
        totalContributions: counts?.[0]?.total || 0,
        totalNativeRewards: counts?.[0]?.total_native || '0',
        claimedCount: counts?.[0]?.claimed || 0
      })
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'internal_error' })
    }
  })
}
