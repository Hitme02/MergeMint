import type { Express, Router } from "express";
import express from "express";
import { mountBindRoutes } from "./bind";
import { verifySignature } from "./github";
import { db } from "./db";
import { mountAuthRoutes } from "./auth";
import { mountOwnerRoutes } from "./owner";
import { mountContractStats } from "./contractStats";
// db is already imported above
import { registerContribution as registerOnChain, PayoutMode } from './contract'
import { ethers } from 'ethers'
import { mountOAuthRoutes } from "./oauth";
import { processPullRequest } from "./processPR";

/**
 * Central place to wire routes.
 */
export function registerRoutes(app: Express) {
  const router: Router = express.Router();

  // Bind endpoints
  mountBindRoutes(router);

  // Auth endpoints (wallet sessions)
  mountAuthRoutes(router);

  // Repo owner endpoints
  mountOwnerRoutes(router);

  // Contract stats
  mountContractStats(router);

  // GitHub OAuth routes
  mountOAuthRoutes(router);

  // Webhook endpoint (duplicate-safe with index.ts); delegate to same processor
  router.post("/webhook", async (req, res) => {
    // Allow dev bypass if enabled and a header is provided, or if secret is not set
    const allowDev = (process.env.ALLOW_DEV_WEBHOOK === 'true' || process.env.ALLOW_DEV_WEBHOOK === '1');
    const headerBypass = String(req.header('X-Dev-Bypass') || req.header('x-dev-bypass') || '').toLowerCase() === '1';
    const devBypass = allowDev && (headerBypass || !process.env.GITHUB_WEBHOOK_SECRET);
    const valid = devBypass ? true : verifySignature(req as any);
    if (!valid) return res.status(401).json({ error: "invalid_signature" });
    const event = req.header("X-GitHub-Event") || req.header("x-github-event") || "unknown";
    const deliveryId = req.header("X-GitHub-Delivery") || req.header("x-github-delivery") || "";
    console.log(`[webhook] ${event} delivery=${deliveryId}`);
    if (event === 'pull_request') {
      return await processPullRequest(req as any, res);
    }
    return res.status(202).json({ received: true, event });
  });

  // Read-only contributions listing for frontend
  router.get("/contributions", async (req, res) => {
    try {
      const { beneficiary, limit } = req.query as { beneficiary?: string; limit?: string };
      const max = Math.min(Number(limit || 20), 100);
      if (!beneficiary) return res.status(400).json({ error: "missing_beneficiary" });
      const { rows } = await db.query(
        `SELECT id, repo, commit_hash, beneficiary, evidence_uri, reward, payout_mode, token_address, tx_hash, claimed, registered_at
         FROM contributions
         WHERE LOWER(beneficiary) = LOWER($1)
         ORDER BY registered_at DESC
         LIMIT $2`,
        [beneficiary, max]
      );
      return res.json({ items: rows });
    } catch (e: any) {
      console.error("[/contributions] error:", e?.message || e);
      return res.status(500).json({ error: "internal_error" });
    }
  });

  // Mount under root
  app.use("/", router);

  // Dev inspector: diagnose why a PR is not registered automatically
  app.get('/dev/inspect/registration', async (req, res) => {
    try {
      if (!((process.env.ALLOW_DEV_BIND === 'true' || process.env.ALLOW_DEV_BIND === '1') || (process.env.ALLOW_DEV_WEBHOOK === 'true' || process.env.ALLOW_DEV_WEBHOOK === '1'))) {
        return res.status(403).json({ error: 'disabled' })
      }
      const repo = String((req.query.repo as string) || '')
      const prNumber = Number(req.query.pr_number || 0)
      if (!repo.includes('/')) return res.status(400).json({ error: 'bad_repo' })
      if (!prNumber) return res.status(400).json({ error: 'bad_pr_number' })

      // Try GitHub via OAuth bearer first, else fallback to env GITHUB_TOKEN
      let access: string | null = null
      const ghHeader = (req.header('X-GitHub-Bearer') || req.header('x-github-bearer') || '').trim()
      const ghBearer = ghHeader.startsWith('Bearer ') ? ghHeader.slice(7) : ghHeader
      if (ghBearer) {
        const sess = await db.query(`SELECT access_token, expires_at FROM oauth_sessions WHERE token = $1`, [ghBearer]).then(r=>r.rows?.[0]).catch(()=>null)
        if (sess && (!sess.expires_at || new Date(sess.expires_at) > new Date())) access = String(sess.access_token)
      }
      if (!access && process.env.GITHUB_TOKEN) access = process.env.GITHUB_TOKEN

      const [owner, name] = repo.split('/')
      const headers: any = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'git-onchain-rewards' }
      if (access) headers['Authorization'] = `Bearer ${access}`
      const prRes = await fetch(`https://api.github.com/repos/${owner}/${name}/pulls/${prNumber}`, { headers })
      const pr = await prRes.json()
      if (!prRes.ok) return res.status(prRes.status).json({ error: 'github_fetch_failed', github: pr })

      const merged = !!pr.merged_at
      const action = 'closed'
      const headSha = pr.merge_commit_sha || pr.head?.sha || ''
      const additions = pr.additions ?? undefined
      const deletions = pr.deletions ?? undefined
      const author = pr.user?.login || ''

      // Repo schema
      const schema = await db.query(`SELECT * FROM repo_schemas WHERE LOWER(repo) = LOWER($1)`, [repo]).then(r=>r.rows?.[0]).catch(()=>null)
      // Policy decision (respect schema min_loc if defined)
      const { evaluatePolicy } = await import('./policy')
      const prevMin = process.env.MIN_LOC
      if (schema?.min_loc != null) process.env.MIN_LOC = String(schema.min_loc)
  const policy = await evaluatePolicy({ action, repo, prNumber, merged, headSha, additions, deletions, minLoc: schema?.min_loc ?? undefined })
      if (prevMin != null) process.env.MIN_LOC = prevMin

      // Author wallet binding
      const bound = author ? await db.query(`SELECT wallet_address FROM users WHERE github_username = $1`, [author]).then(r=>r.rows?.[0]?.wallet_address || null) : null

      // Compute id and check DB
      const { ethers } = await import('ethers')
      const commitHashBytes32 = headSha ? (headSha.startsWith('0x') && headSha.length === 66 ? headSha : ethers.keccak256(ethers.toUtf8Bytes(headSha))) : ethers.ZeroHash
      const id = ethers.solidityPackedKeccak256(['string','bytes32'], [repo, commitHashBytes32])
      const row = await db.query(`SELECT id, tx_hash, claimed FROM contributions WHERE id = $1`, [id]).then(r=>r.rows?.[0] || null)

      return res.json({
        repo,
        prNumber,
        id,
        merged,
        additions,
        deletions,
        author,
        boundWallet: bound,
        schema,
        policy,
        registered: !!row,
        onchainTx: row?.tx_hash || null,
        claimed: !!row?.claimed
      })
    } catch (e: any) {
      console.error('[/dev/inspect/registration] error', e?.message || e)
      return res.status(500).json({ error: 'internal_error' })
    }
  })

  // Dev helper: register any DB contributions that are missing on-chain tx for a beneficiary
  app.post('/dev/onchain/register-missing', async (req, res) => {
    try {
      if (!((process.env.ALLOW_DEV_BIND === 'true' || process.env.ALLOW_DEV_BIND === '1') || (process.env.ALLOW_DEV_WEBHOOK === 'true' || process.env.ALLOW_DEV_WEBHOOK === '1'))) {
        return res.status(403).json({ error: 'disabled' })
      }
      const { beneficiary } = req.body as { beneficiary?: string }
      if (!beneficiary) return res.status(400).json({ error: 'missing_beneficiary' })
      const { rows } = await db.query(
        `SELECT id, repo, commit_hash, beneficiary, evidence_uri, reward, payout_mode, token_address, tx_hash
         FROM contributions
         WHERE LOWER(beneficiary) = LOWER($1)
         ORDER BY registered_at DESC
         LIMIT 20`,
        [beneficiary]
      )
      const results: any[] = []
      for (const it of rows) {
        if (it.tx_hash) { results.push({ id: it.id, skipped: true, reason: 'already_onchain', txHash: it.tx_hash }); continue }
        const payoutMode = (String(it.payout_mode || 'NATIVE').toUpperCase() === 'ERC20') ? PayoutMode.ERC20 : PayoutMode.NATIVE
        const token = payoutMode === PayoutMode.ERC20 ? (it.token_address || '0x0000000000000000000000000000000000000000') : '0x0000000000000000000000000000000000000000'
        try {
          const txHash = await registerOnChain({
            id: it.id,
            beneficiary: it.beneficiary,
            repo: it.repo,
            commitHash: it.commit_hash,
            evidenceURI: it.evidence_uri || '',
            reward: String(it.reward),
            payoutMode,
            token
          })
          await db.query('UPDATE contributions SET tx_hash = $1 WHERE id = $2', [txHash, it.id])
          results.push({ id: it.id, txHash })
        } catch (e: any) {
          results.push({ id: it.id, error: e?.message || String(e) })
        }
      }
      return res.json({ ok: true, count: results.length, results })
    } catch (e: any) {
      console.error('[/dev/onchain/register-missing] error', e?.message || e)
      return res.status(500).json({ error: 'internal_error' })
    }
  })

  // After a successful claim tx in the DApp, mark claimed in DB (verifies on-chain first)
  app.post('/claim/mark', async (req, res) => {
    try {
      const { id, txHash } = req.body as { id?: string; txHash?: string }
      if (!id || !/^0x([a-fA-F0-9]{64})$/.test(id)) return res.status(400).json({ error: 'bad_id' })
      const RPC_URL = process.env.RPC_URL
      const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS
      if (!RPC_URL || !REGISTRY_ADDRESS) return res.status(400).json({ error: 'missing_env' })
      if (String(process.env.ENABLE_ONCHAIN || '').toLowerCase() !== 'true') {
        return res.status(503).json({ error: 'chain_unavailable', hint: 'ENABLE_ONCHAIN is not true; enable and ensure RPC_URL/REGISTRY_ADDRESS are configured' })
      }
      const provider = new ethers.JsonRpcProvider(RPC_URL)
      const abi = ['function contributions(bytes32) view returns (address beneficiary,string repo,bytes32 commitHash,string evidenceURI,uint256 reward,uint8 payoutMode,address token,bool claimed,uint64 registeredAt,address registrar)']
      const c = new ethers.Contract(REGISTRY_ADDRESS, abi, provider)
      const r = await c.contributions(id)
      const onchainClaimed = !!r[7]
      if (!onchainClaimed) {
        return res.status(202).json({ ok: false, claimed: false })
      }
      await db.query('UPDATE contributions SET claimed = TRUE, tx_hash = COALESCE($2, tx_hash) WHERE id = $1', [id, txHash || null])
      return res.json({ ok: true, claimed: true })
    } catch (e: any) {
      console.error('[/claim/mark] error', e?.message || e)
      return res.status(500).json({ error: 'internal_error' })
    }
  })

  // Dev helper: sync claimed flags from chain to DB for a beneficiary
  app.post('/dev/onchain/sync-claims', async (req, res) => {
    try {
      if (!((process.env.ALLOW_DEV_BIND === 'true' || process.env.ALLOW_DEV_BIND === '1') || (process.env.ALLOW_DEV_WEBHOOK === 'true' || process.env.ALLOW_DEV_WEBHOOK === '1'))) {
        return res.status(403).json({ error: 'disabled' })
      }
      const { beneficiary } = req.body as { beneficiary?: string }
      if (!beneficiary) return res.status(400).json({ error: 'missing_beneficiary' })
      const RPC_URL = process.env.RPC_URL
      const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS
      if (!RPC_URL || !REGISTRY_ADDRESS) return res.status(400).json({ error: 'missing_env' })
      const provider = new ethers.JsonRpcProvider(RPC_URL)
      const abi = ['function contributions(bytes32) view returns (address beneficiary,string repo,bytes32 commitHash,string evidenceURI,uint256 reward,uint8 payoutMode,address token,bool claimed,uint64 registeredAt,address registrar)']
      const c = new ethers.Contract(REGISTRY_ADDRESS, abi, provider)
      const { rows } = await db.query(
        `SELECT id, claimed FROM contributions WHERE LOWER(beneficiary) = LOWER($1) ORDER BY registered_at DESC LIMIT 50`,
        [beneficiary]
      )
      const updates: any[] = []
      for (const it of rows) {
        try {
          const r = await c.contributions(it.id)
          const onchainClaimed = !!r[7]
          if (onchainClaimed && !it.claimed) {
            await db.query('UPDATE contributions SET claimed = TRUE WHERE id = $1', [it.id])
            updates.push({ id: it.id, claimed: true })
          }
        } catch (e: any) {
          updates.push({ id: it.id, error: e?.message || String(e) })
        }
      }
      return res.json({ ok: true, updates })
    } catch (e: any) {
      console.error('[/dev/onchain/sync-claims] error', e?.message || e)
      return res.status(500).json({ error: 'internal_error' })
    }
  })

  // Dev helper: fund registry with native ETH from verifier wallet
  app.post('/dev/contract/fund-native', async (req, res) => {
    try {
      if (!((process.env.ALLOW_DEV_BIND === 'true' || process.env.ALLOW_DEV_BIND === '1') || (process.env.ALLOW_DEV_WEBHOOK === 'true' || process.env.ALLOW_DEV_WEBHOOK === '1'))) {
        return res.status(403).json({ error: 'disabled' })
      }
      const RPC_URL = process.env.RPC_URL
      const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS
      const PRIV = process.env.VERIFIER_PRIVATE_KEY
      if (!RPC_URL || !REGISTRY_ADDRESS || !PRIV) return res.status(400).json({ error: 'missing_env' })
      const { amountEth } = req.body as { amountEth?: string }
      const amount = amountEth ? amountEth : '0.1'
      const provider = new ethers.JsonRpcProvider(RPC_URL)
      const wallet = new ethers.Wallet(PRIV, provider)
      const value = ethers.parseEther(amount)
      const est = await provider.estimateGas({ to: REGISTRY_ADDRESS, from: await wallet.getAddress(), value })
      const gasLimit = est + 2_000n < 30_000n ? 30_000n : est + 2_000n
      const tx = await wallet.sendTransaction({ to: REGISTRY_ADDRESS, value, gasLimit })
      const rc = await tx.wait()
      return res.json({ ok: true, hash: tx.hash, status: rc?.status === 1 ? 'confirmed' : 'unknown' })
    } catch (e: any) {
      console.error('[/dev/contract/fund-native] error', e?.message || e)
      return res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) })
    }
  })
}
