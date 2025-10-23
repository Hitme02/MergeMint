import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { ethers } from 'ethers'
import { db } from './db'

const SIGNING_PREFIX = 'git-onchain-rewards:auth'

function messageFor(addr: string, nonce: string) {
  return `${SIGNING_PREFIX}\nwallet:${ethers.getAddress(addr)}\nnonce:${nonce}`
}

export function mountAuthRoutes(router: Router) {
  router.post('/auth/nonce', async (req: Request, res: Response) => {
    const { wallet } = req.body as { wallet?: string }
    if (!wallet || !ethers.isAddress(wallet)) return res.status(400).json({ error: 'invalid_wallet' })
    const nonce = crypto.randomBytes(16).toString('hex')
    // store nonce in sessions table with a short expiry placeholder
    const token = `nonce:${ethers.getAddress(wallet)}:${nonce}`
    const expires = new Date(Date.now() + 5 * 60 * 1000) // 5m
    await db.query(
      `INSERT INTO sessions (token, wallet_address, expires_at) VALUES ($1,$2,$3)
       ON CONFLICT (token) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
      [token, ethers.getAddress(wallet), expires]
    )
    res.json({ wallet: ethers.getAddress(wallet), messageToSign: messageFor(wallet, nonce) })
  })

  router.post('/auth/verify', async (req: Request, res: Response) => {
    const { wallet, signature } = req.body as { wallet?: string; signature?: string }
    if (!wallet || !ethers.isAddress(wallet)) return res.status(400).json({ error: 'invalid_wallet' })
    if (!signature) return res.status(400).json({ error: 'missing_signature' })
    // Recover by scanning recent nonces for this wallet
    const { rows } = await db.query(`SELECT token FROM sessions WHERE wallet_address = $1 AND token LIKE 'nonce:%' ORDER BY issued_at DESC LIMIT 20`, [ethers.getAddress(wallet)])
    for (const r of rows) {
      const parts = (r.token as string).split(':')
      const nonce = parts[2]
      const msg = messageFor(wallet, nonce)
      try {
        const recovered = ethers.verifyMessage(msg, signature)
        if (ethers.getAddress(recovered) === ethers.getAddress(wallet)) {
          // Create a bearer token session
          const bearer = `bearer:${crypto.randomBytes(24).toString('hex')}`
          const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)
          await db.query(`INSERT INTO sessions (token, wallet_address, expires_at) VALUES ($1,$2,$3)`, [bearer, ethers.getAddress(wallet), expires])
          return res.json({ token: bearer, wallet: ethers.getAddress(wallet), expiresAt: expires.toISOString() })
        }
      } catch {}
    }
    return res.status(400).json({ error: 'bad_signature' })
  })
}

export async function requireOwner(req: Request): Promise<{ wallet: string } | null> {
  const auth = req.header('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const { rows } = await db.query(`SELECT wallet_address FROM sessions WHERE token = $1 AND (expires_at IS NULL OR expires_at > NOW())`, [token])
  const wallet = rows?.[0]?.wallet_address
  if (!wallet) return null
  return { wallet }
}
