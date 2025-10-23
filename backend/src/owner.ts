import { Router, Request, Response } from 'express'
import { ethers } from 'ethers'
import { db } from './db'
import { requireOwner } from './auth'
import { evaluatePolicy } from './policy'
import { pinToIPFS } from './ipfs'
import { computeId, registerContribution, PayoutMode, canRegisterOnChain, getVerifierAddress } from './contract'

export function mountOwnerRoutes(router: Router) {
  // Dev-only: setup or update a GitHub webhook without wallet auth (uses OAuth session)
  router.post('/dev/setup-webhook', async (req: Request, res: Response) => {
    try {
      if (!(process.env.ALLOW_DEV_BIND === 'true' || process.env.ALLOW_DEV_BIND === '1')) {
        return res.status(403).json({ error: 'disabled' })
      }
      const { repo, webhook_url } = req.body as { repo?: string; webhook_url?: string }
      if (!repo || !String(repo).includes('/')) return res.status(400).json({ error: 'bad_repo' })
      const bodyUrl = (webhook_url && typeof webhook_url === 'string' && /^https?:\/\//i.test(webhook_url)) ? webhook_url : ''
      if (!bodyUrl) return res.status(400).json({ error: 'bad_webhook_url' })

      // Resolve GitHub access token from OAuth session, with fallback to env
      let accessToken: string | null = null
      const ghHeader = (req.header('X-GitHub-Bearer') || req.header('x-github-bearer') || '').trim()
      const ghBearer = ghHeader.startsWith('Bearer ') ? ghHeader.slice(7) : ghHeader
      if (ghBearer) {
        const sessRes = await db.query(`SELECT access_token, expires_at FROM oauth_sessions WHERE token = $1`, [ghBearer])
        const sess = sessRes?.rows?.[0]
        if (sess && (!sess.expires_at || new Date(sess.expires_at) > new Date())) {
          accessToken = String(sess.access_token)
        } else if (!accessToken) {
          return res.status(401).json({ error: 'bad_or_expired_github_token' })
        }
      }
      if (!accessToken && process.env.GITHUB_TOKEN) {
        accessToken = process.env.GITHUB_TOKEN
      }
      if (!accessToken) return res.status(401).json({ error: 'missing_github_token' })

      const [owner, name] = String(repo).split('/')
      // Verify repo visibility and our permissions with this token
      const ghRepoRes = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
        headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'git-onchain-rewards' }
      })
      const ghRepoJson = await ghRepoRes.json() as any
      if (!ghRepoRes.ok) return res.status(ghRepoRes.status).json(ghRepoJson)
      const perms = ghRepoJson?.permissions || {}
      const allowed = !!(perms.admin || perms.maintain)
      if (!allowed) return res.status(403).json({ error: 'not_repo_admin' })

      // Create or update webhook (no secret in dev)
      const hooksRes = await fetch(`https://api.github.com/repos/${owner}/${name}/hooks?per_page=100`, {
        headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'git-onchain-rewards' }
      })
      const hooks = await hooksRes.json()
      if (!hooksRes.ok) return res.status(hooksRes.status).json({ error: 'github_list_failed', github: hooks })

      const norm = (u: string) => String(u || '').replace(/\/$/, '')
      const existing = Array.isArray(hooks) ? hooks.find((h: any) => norm(h?.config?.url || '') === norm(bodyUrl)) : null
      if (existing) {
        const updRes = await fetch(`https://api.github.com/repos/${owner}/${name}/hooks/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'git-onchain-rewards', 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: true, events: ['pull_request'], config: { url: bodyUrl, content_type: 'json', insecure_ssl: '0' } })
        })
        const upd = await updRes.json()
        if (!updRes.ok) return res.status(updRes.status).json({ error: 'github_patch_failed', github: upd })
        return res.json({ ok: true, repo: ghRepoJson?.full_name || repo, updated: true, id: upd.id })
      }

      const addRes = await fetch(`https://api.github.com/repos/${owner}/${name}/hooks`, {
        method: 'POST',
        headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'git-onchain-rewards', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'web', active: true, events: ['pull_request'], config: { url: bodyUrl, content_type: 'json', insecure_ssl: '0' } })
      })
      const add = await addRes.json()
      if (!addRes.ok) return res.status(addRes.status).json({ error: 'github_post_failed', github: add })
      return res.json({ ok: true, repo: ghRepoJson?.full_name || repo, created: true, id: add.id })
    } catch (e: any) {
      console.error('[/dev/setup-webhook] error', e?.message || e)
      return res.status(500).json({ error: 'internal_error' })
    }
  })
  // Dev helper: inspect GitHub permissions for a repo using current OAuth token
  router.get('/dev/github/permissions', async (req: Request, res: Response) => {
    if (!(process.env.ALLOW_DEV_BIND === 'true' || process.env.ALLOW_DEV_BIND === '1')) {
      return res.status(403).json({ error: 'disabled' })
    }
    const repo = (req.query.repo as string) || ''
    if (!repo || !repo.includes('/')) return res.status(400).json({ error: 'bad_repo' })
    try {
      const ghHeader = (req.header('X-GitHub-Bearer') || req.header('x-github-bearer') || '').trim()
      const ghBearer = ghHeader.startsWith('Bearer ') ? ghHeader.slice(7) : ghHeader
      if (!ghBearer) return res.status(401).json({ error: 'missing_github_token' })
      const sessRes = await db.query(`SELECT github_username, access_token, expires_at FROM oauth_sessions WHERE token = $1`, [ghBearer])
      const sess = sessRes?.rows?.[0]
      if (!sess) return res.status(401).json({ error: 'bad_github_token' })
      if (sess.expires_at && new Date(sess.expires_at) < new Date()) return res.status(401).json({ error: 'github_token_expired' })
      const [owner, name] = String(repo).split('/')
      const ghRepoRes = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
        headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${String(sess.access_token)}`, 'User-Agent': 'git-onchain-rewards' }
      })
      const json = await ghRepoRes.json()
      if (!ghRepoRes.ok) return res.status(ghRepoRes.status).json(json)
      const perms = (json && (json as any).permissions) || {}
      return res.json({ ok: true, repo: json?.full_name || repo, githubUser: sess.github_username || null, permissions: perms })
    } catch (e: any) {
      console.error('[dev/github/permissions] error', e?.message || e)
      return res.status(500).json({ error: 'internal_error' })
    }
  })
  router.get('/owner/schema', async (req: Request, res: Response) => {
    const repo = (req.query.repo as string) || ''
    if (!repo) return res.status(400).json({ error: 'missing_repo' })
    const { rows } = await db.query(`SELECT * FROM repo_schemas WHERE LOWER(repo) = LOWER($1)`, [repo])
    res.json({ schema: rows?.[0] || null })
  })

  router.post('/owner/schema', async (req: Request, res: Response) => {
    const auth = await requireOwner(req)
    if (!auth) return res.status(401).json({ error: 'unauthorized' })
  const { repo, min_loc, payout_mode, reward, token_address } = req.body as any
    if (!repo) return res.status(400).json({ error: 'missing_repo' })
    if (!String(repo).includes('/')) return res.status(400).json({ error: 'bad_repo' })

    // Enforce GitHub collaborator/maintainer/admin access using OAuth session token passed via header
    try {
      const ghHeader = (req.header('X-GitHub-Bearer') || req.header('x-github-bearer') || '').trim()
      const ghBearer = ghHeader.startsWith('Bearer ') ? ghHeader.slice(7) : ghHeader
      if (!ghBearer) return res.status(401).json({ error: 'missing_github_token' })
      const sessRes = await db.query(`SELECT github_username, access_token, expires_at FROM oauth_sessions WHERE token = $1`, [ghBearer])
      const sess = sessRes?.rows?.[0]
      if (!sess) return res.status(401).json({ error: 'bad_github_token' })
      if (sess.expires_at && new Date(sess.expires_at) < new Date()) return res.status(401).json({ error: 'github_token_expired' })

      const [owner, name] = String(repo).split('/')
      const ghRepoRes = await fetch(`https://api.github.com/repos/${owner}/${name}` , {
        headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${String(sess.access_token)}`, 'User-Agent': 'git-onchain-rewards' }
      })
      const ghRepoJson = await ghRepoRes.json() as any
      if (!ghRepoRes.ok) {
        return res.status(ghRepoRes.status).json(ghRepoJson)
      }
      const perms = ghRepoJson?.permissions || {}
      const allowed = !!(perms.admin || perms.maintain || perms.push)
      if (String(process.env.LOG_LEVEL || '').toLowerCase() === 'debug') {
        console.log(`[owner/schema] github perms`, { repo: ghRepoJson?.full_name, perms, allowed })
      }
      if (!allowed) return res.status(403).json({ error: 'not_repo_collaborator' })
      // Use GitHub's canonical full_name for storage/lookup consistency
      if (ghRepoJson?.full_name) (req as any)._canonicalRepo = String(ghRepoJson.full_name)
    } catch (err) {
      console.error('[owner/schema] github permission check failed', (err as any)?.message || err)
      return res.status(500).json({ error: 'github_permission_check_failed' })
    }
    // Check role: wallet must have owner role for repo or global
    // Treat empty string repo ('') as a global owner scope
    const canonicalRepo = (req as any)._canonicalRepo || repo
    const r = await db.query(
      `SELECT 1 FROM user_roles
       WHERE wallet_address = $1 AND role = 'owner' AND (repo = $2 OR repo = '')
       LIMIT 1`,
      [ethers.getAddress(auth.wallet), canonicalRepo]
    )
    if (!r.rowCount) {
      return res.status(403).json({
        error: 'not_owner_role',
        wallet: ethers.getAddress(auth.wallet),
        repo: canonicalRepo,
        hint: 'Grant an owner role for this repo (or global) via POST /dev/owner/grant with { wallet, repo } while ALLOW_DEV_BIND is enabled.'
      })
    }
    // Validate reward is numeric string (uint256)
    const rewardStr = String(reward ?? '0')
    if (!/^\d+$/.test(rewardStr)) {
      return res.status(400).json({ error: 'bad_reward_format', hint: 'Provide reward in raw units (wei for ETH). Example: 1 ETH = 1000000000000000000' })
    }
    await db.query(
      `INSERT INTO repo_schemas (repo, min_loc, payout_mode, reward, token_address, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (repo) DO UPDATE SET min_loc = EXCLUDED.min_loc, payout_mode = EXCLUDED.payout_mode, reward = EXCLUDED.reward, token_address = EXCLUDED.token_address, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [canonicalRepo, Number(min_loc ?? 5), String(payout_mode ?? 'NATIVE').toUpperCase(), rewardStr, token_address || null, ethers.getAddress(auth.wallet)]
    )
    const { rows } = await db.query(`SELECT * FROM repo_schemas WHERE repo = $1`, [canonicalRepo])
    res.json({ schema: rows?.[0] || null })
  })

  // Dev: grant owner role to a wallet for a repo
  router.post('/dev/owner/grant', async (req: Request, res: Response) => {
    if (!(process.env.ALLOW_DEV_BIND === 'true' || process.env.ALLOW_DEV_BIND === '1')) return res.status(403).json({ error: 'disabled' })
    const { wallet, repo } = req.body as any
    if (!wallet || !ethers.isAddress(wallet)) return res.status(400).json({ error: 'bad_wallet' })
    // Use empty string to represent global scope to satisfy PRIMARY KEY (repo is NOT NULL under PK semantics)
    const scope = (repo && String(repo)) || ''
    await db.query(
      `INSERT INTO user_roles (wallet_address, role, repo)
       VALUES ($1,'owner',$2)
       ON CONFLICT (wallet_address, role, repo) DO NOTHING`,
      [ethers.getAddress(wallet), scope]
    )
    res.json({ ok: true, wallet: ethers.getAddress(wallet), repo: repo || null })
  })

  // Owner action: setup or update the GitHub webhook for this repo
  router.post('/owner/setup-webhook', async (req: Request, res: Response) => {
    try {
      const auth = await requireOwner(req)
      if (!auth) return res.status(401).json({ error: 'unauthorized' })
  const { repo, webhook_url } = req.body as { repo?: string; webhook_url?: string }
      if (!repo || !String(repo).includes('/')) return res.status(400).json({ error: 'bad_repo' })

      // Require OAuth bearer and check collaborator rights
      const ghHeader = (req.header('X-GitHub-Bearer') || req.header('x-github-bearer') || '').trim()
      const ghBearer = ghHeader.startsWith('Bearer ') ? ghHeader.slice(7) : ghHeader
      if (!ghBearer) return res.status(401).json({ error: 'missing_github_token' })
      const sessRes = await db.query(`SELECT access_token, expires_at FROM oauth_sessions WHERE token = $1`, [ghBearer])
      const sess = sessRes?.rows?.[0]
      if (!sess) return res.status(401).json({ error: 'bad_github_token' })
      if (sess.expires_at && new Date(sess.expires_at) < new Date()) return res.status(401).json({ error: 'github_token_expired' })
      const accessToken = String(sess.access_token)

      const [owner, name] = String(repo).split('/')
      const ghRepoRes = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
        headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'git-onchain-rewards' }
      })
      const ghRepoJson = await ghRepoRes.json() as any
      if (!ghRepoRes.ok) return res.status(ghRepoRes.status).json(ghRepoJson)
      const perms = ghRepoJson?.permissions || {}
      const allowed = !!(perms.admin || perms.maintain)
      if (!allowed) return res.status(403).json({ error: 'not_repo_admin' })

  const canonical = String(ghRepoJson?.full_name || repo)
  // Allow override via body (useful when exposing a tunnel URL); fallback to env/default
  const bodyUrl = (webhook_url && typeof webhook_url === 'string' && /^https?:\/\//i.test(webhook_url)) ? webhook_url : ''
  const webhookUrl = bodyUrl || process.env.WEBHOOK_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}/webhook`
      const secret = process.env.GITHUB_WEBHOOK_SECRET || ''
      if (!secret) return res.status(400).json({ error: 'missing_server_secret', hint: 'Set GITHUB_WEBHOOK_SECRET in backend env' })

      // List existing hooks
      const hooksRes = await fetch(`https://api.github.com/repos/${owner}/${name}/hooks?per_page=100`, {
        headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'git-onchain-rewards' }
      })
      const hooks = await hooksRes.json()
      if (!hooksRes.ok) {
        console.error('[/owner/setup-webhook] list hooks failed', hooksRes.status, hooksRes.statusText, hooks)
        return res.status(hooksRes.status).json({ error: 'github_list_failed', attempted_url: webhookUrl, github: hooks })
      }

      const norm = (u: string) => String(u || '').replace(/\/$/, '')
      const existing = Array.isArray(hooks) ? hooks.find((h: any) => norm(h?.config?.url || '') === norm(webhookUrl)) : null
      const createBody = {
        name: 'web',
        active: true,
        events: ['pull_request'],
        config: { url: webhookUrl, content_type: 'json', secret, insecure_ssl: '0' as any }
      }

      if (existing) {
        const updRes = await fetch(`https://api.github.com/repos/${owner}/${name}/hooks/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'git-onchain-rewards', 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: true, events: ['pull_request'], config: { url: webhookUrl, content_type: 'json', secret, insecure_ssl: '0' } })
        })
        const upd = await updRes.json()
        if (!updRes.ok) {
          const safeConfig = { url: webhookUrl, content_type: 'json', insecure_ssl: '0' }
          console.error('[/owner/setup-webhook] PATCH failed', updRes.status, updRes.statusText, { repo: canonical, config: safeConfig, response: upd })
          return res.status(updRes.status).json({ error: 'github_patch_failed', attempted_url: webhookUrl, github: upd })
        }
        return res.json({ ok: true, repo: canonical, updated: true, id: upd.id })
      }

      // Create hook
      const addRes = await fetch(`https://api.github.com/repos/${owner}/${name}/hooks`, {
        method: 'POST',
        headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'git-onchain-rewards', 'Content-Type': 'application/json' },
        body: JSON.stringify(createBody)
      })
      const add = await addRes.json()
      if (addRes.ok) {
        return res.json({ ok: true, repo: canonical, created: true, id: add.id })
      }

      const safeCreate = { name: 'web', active: true, events: ['pull_request'], config: { url: webhookUrl, content_type: 'json', insecure_ssl: '0' } }
  console.error('[/owner/setup-webhook] POST failed', addRes.status, addRes.statusText, { repo: canonical, request: safeCreate, response: add })

      if (addRes.status === 422) {
        // Fallback: re-list hooks and patch by host+path match
        const hooksRes2 = await fetch(`https://api.github.com/repos/${owner}/${name}/hooks?per_page=100`, {
          headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'git-onchain-rewards' }
        })
        const hooks2 = await hooksRes2.json()
        if (hooksRes2.ok && Array.isArray(hooks2)) {
          const upath = (u: string) => {
            try { const url = new URL(u); return `${url.host}${url.pathname.replace(/\/$/, '')}` } catch { return '' }
          }
          const targetPath = upath(webhookUrl)
          const match = hooks2.find((h: any) => upath(h?.config?.url || '') === targetPath)
          if (match) {
            const updRes = await fetch(`https://api.github.com/repos/${owner}/${name}/hooks/${match.id}`, {
              method: 'PATCH',
              headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'git-onchain-rewards', 'Content-Type': 'application/json' },
              body: JSON.stringify({ active: true, events: ['pull_request'], config: { url: webhookUrl, content_type: 'json', secret, insecure_ssl: '0' } })
            })
            const upd = await updRes.json()
            if (!updRes.ok) {
              const safeConfig = { url: webhookUrl, content_type: 'json', insecure_ssl: '0' }
              console.error('[/owner/setup-webhook] PATCH(fallback) failed', updRes.status, updRes.statusText, { repo: canonical, config: safeConfig, response: upd })
              return res.status(updRes.status).json({ error: 'github_patch_fallback_failed', attempted_url: webhookUrl, github: upd })
            }
            return res.json({ ok: true, repo: canonical, updated: true, id: upd.id })
          }
        }
      }

      return res.status(addRes.status).json({ error: 'github_post_failed', attempted_url: webhookUrl, github: add })
    } catch (e: any) {
      console.error('[/owner/setup-webhook] error', e?.message || e)
      return res.status(500).json({ error: 'internal_error' })
    }
  })
  // Owner action: register a merged PR by number (rehydrates same flow as webhook)
  router.post('/owner/register-pr', async (req: Request, res: Response) => {
    try {
      const auth = await requireOwner(req)
      if (!auth) return res.status(401).json({ error: 'unauthorized' })
      const { repo, pr_number } = req.body as { repo?: string; pr_number?: number }
      if (!repo || !String(repo).includes('/')) return res.status(400).json({ error: 'bad_repo' })
      const prNumber = Number(pr_number)
      if (!prNumber || prNumber <= 0) return res.status(400).json({ error: 'bad_pr_number' })

      // Verify wallet has owner role for this repo (or global)
      const r = await db.query(
        `SELECT 1 FROM user_roles WHERE wallet_address = $1 AND role = 'owner' AND (repo = $2 OR repo = '') LIMIT 1`,
        [ethers.getAddress(auth.wallet), repo]
      )
      if (!r.rowCount) return res.status(403).json({ error: 'forbidden' })

      // Resolve GitHub OAuth access and collaborator permission
      const ghHeader = (req.header('X-GitHub-Bearer') || req.header('x-github-bearer') || '').trim()
      const ghBearer = ghHeader.startsWith('Bearer ') ? ghHeader.slice(7) : ghHeader
      if (!ghBearer) return res.status(401).json({ error: 'missing_github_token' })
      const sessRes = await db.query(`SELECT access_token, expires_at FROM oauth_sessions WHERE token = $1`, [ghBearer])
      const sess = sessRes?.rows?.[0]
      if (!sess) return res.status(401).json({ error: 'bad_github_token' })
      if (sess.expires_at && new Date(sess.expires_at) < new Date()) return res.status(401).json({ error: 'github_token_expired' })
      const accessToken = String(sess.access_token)

      const [owner, name] = String(repo).split('/')
      // Permission check
      const permRes = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
        headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'git-onchain-rewards' }
      })
      const permJson = await permRes.json()
      if (!permRes.ok) return res.status(permRes.status).json(permJson)
      const perms = (permJson && (permJson as any).permissions) || {}
      if (!(perms.admin || perms.maintain || perms.push)) return res.status(403).json({ error: 'not_repo_collaborator' })

      // Fetch PR details
      const prRes = await fetch(`https://api.github.com/repos/${owner}/${name}/pulls/${prNumber}`, {
        headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'git-onchain-rewards' }
      })
      const pr = await prRes.json()
      if (!prRes.ok) return res.status(prRes.status).json(pr)
      if (!pr?.merged_at) return res.status(400).json({ error: 'pr_not_merged' })

      const merged = true
      const action = 'closed'
      const headSha = pr.merge_commit_sha || pr.head?.sha || ''
      const additions = pr.additions ?? undefined
      const deletions = pr.deletions ?? undefined
      const author = pr.user?.login || undefined

      // Load repo schema
  const schemaRow = await db.query(`SELECT min_loc, payout_mode, reward, token_address FROM repo_schemas WHERE LOWER(repo) = LOWER($1)`, [repo]).then(r => r.rows?.[0]).catch(() => null)

      // Evaluate policy using schema min_loc if set
      const prevMin = process.env.MIN_LOC
      if (schemaRow?.min_loc != null) process.env.MIN_LOC = String(schemaRow.min_loc)
  const policy = await evaluatePolicy({ action, repo, prNumber, merged, headSha, additions, deletions, minLoc: schemaRow?.min_loc ?? undefined })
      if (prevMin != null) process.env.MIN_LOC = prevMin
      if (!policy.ok) {
        return res.status(202).json({ received: true, accepted: false, reasons: policy.reasons })
      }

      // Map author to bound wallet
      let beneficiary: string | null = null
      if (author) {
        const r = await db.query(`SELECT wallet_address FROM users WHERE github_username = $1`, [author])
        beneficiary = r.rows?.[0]?.wallet_address || null
      }
      if (!beneficiary || !ethers.isAddress(beneficiary)) {
        return res.status(202).json({ received: true, accepted: false, reasons: ['no_bound_wallet_for_author'], author })
      }

      // Evidence and ID
      const evidence = { repo, commitHash: headSha, author, prNumber, metadata: { additions, deletions, policy: policy.details } }
      const evidenceURI = await pinToIPFS(evidence)
      const commitHashBytes32 = (headSha && headSha.length) ? (headSha.startsWith('0x') && headSha.length === 66 ? headSha : ethers.keccak256(ethers.toUtf8Bytes(headSha))) : ethers.ZeroHash
      const id = computeId(repo, commitHashBytes32)
      const payoutMode = (schemaRow?.payout_mode || 'NATIVE').toUpperCase() === 'ERC20' ? PayoutMode.ERC20 : PayoutMode.NATIVE
  const reward = String(schemaRow?.reward ?? '0')
      const token = payoutMode === PayoutMode.ERC20 ? (schemaRow?.token_address || ethers.ZeroAddress) : ethers.ZeroAddress

      // On-chain (optional)
      let txHash: string | null = null
      if (canRegisterOnChain()) {
        try {
          txHash = await registerContribution({ id, beneficiary, repo, commitHash: commitHashBytes32, evidenceURI, reward, payoutMode, token })
        } catch (e: any) {
          console.error('[/owner/register-pr] on-chain register failed:', e?.message || e)
        }
      }

      // Persist to DB
      try {
        await db.query(
          `INSERT INTO contributions (id, repo, commit_hash, beneficiary, evidence_uri, reward, payout_mode, token_address, registrar, tx_hash, claimed, author_github)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (id) DO NOTHING`,
          [id, repo, commitHashBytes32, beneficiary, evidenceURI, reward, payoutMode === PayoutMode.ERC20 ? 'ERC20' : 'NATIVE', token, getVerifierAddress(), txHash, false, author]
        )
      } catch (e: any) {
        console.error('[/owner/register-pr] db insert failed:', e?.message || e)
      }

      return res.status(201).json({ accepted: true, id, repo, beneficiary, reward, payoutMode: payoutMode === PayoutMode.ERC20 ? 'ERC20' : 'NATIVE', txHash })
    } catch (e: any) {
      console.error('[/owner/register-pr] error', e?.message || e)
      return res.status(500).json({ error: 'internal_error' })
    }
  })
}
