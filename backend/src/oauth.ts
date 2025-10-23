import type { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { db, withTransaction } from './db'

const CLIENT_ID = process.env.GITHUB_CLIENT_ID || ''
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || ''
const CALLBACK_URL = process.env.GITHUB_OAUTH_CALLBACK || ''
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || ''

function randomToken(prefix = 'bearer:') {
  return `${prefix}${crypto.randomBytes(24).toString('hex')}`
}

export function mountOAuthRoutes(router: Router) {
  // 1) Kick off OAuth: redirect user to GitHub
  router.get('/auth/github/start', async (_req: Request, res: Response) => {
    if (!CLIENT_ID || !CALLBACK_URL) {
      return res.status(500).json({ error: 'oauth_not_configured' })
    }
  // Request additional scopes so we can manage repo webhooks and access private repos if needed
  const scope = encodeURIComponent('read:user user:email repo admin:repo_hook')
    const redirect = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&scope=${scope}`
    return res.redirect(302, redirect)
  })

  // 2) Callback: exchange code for access token, fetch user, create oauth session
  router.get('/auth/github/callback', async (req: Request, res: Response) => {
    try {
      const code = (req.query.code as string) || ''
      if (!code) return res.status(400).json({ error: 'missing_code' })
      if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).json({ error: 'oauth_not_configured' })

      // Exchange code for token with retries on 5xx/429 or non-JSON (GitHub "Unicorn" outage page)
      const form = new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: CALLBACK_URL
      })

      const fetchWithRetry = async () => {
        const maxAttempts = 3
        const baseDelay = 300
        let last: { status?: number; raw?: string } = {}
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const ac = new AbortController()
          const t = setTimeout(() => ac.abort(), 8000)
          try {
            const resp = await fetch('https://github.com/login/oauth/access_token', {
              method: 'POST',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'git-onchain-rewards'
              },
              body: form.toString(),
              signal: ac.signal,
            })
            clearTimeout(t)
            const text = await resp.text()
            last = { status: resp.status, raw: text }
            let json: any
            try { json = JSON.parse(text) } catch { json = { raw: text } }

            const retryable = resp.status === 429 || resp.status >= 500 || (typeof json === 'object' && json.raw && /<!DOCTYPE html>/i.test(String(json.raw)))
            if (resp.ok && json && json.access_token) return { ok: true as const, json }
            if (attempt < maxAttempts && retryable) {
              // Honor Retry-After (seconds) when present, else exponential backoff with jitter
              const ra = Number(resp.headers.get('retry-after') || '')
              const retryAfterMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 0
              const jitter = Math.floor(Math.random() * 150)
              const wait = retryAfterMs || (baseDelay * attempt + jitter)
              await new Promise(r => setTimeout(r, wait))
              continue
            }
            return { ok: false as const, status: resp.status, json }
          } catch (err: any) {
            clearTimeout(t)
            if (attempt < maxAttempts) {
              const jitter = Math.floor(Math.random() * 150)
              const wait = baseDelay * attempt + jitter
              await new Promise(r => setTimeout(r, wait))
              continue
            }
            return { ok: false as const, status: last.status || 500, json: { error: 'network_error', message: err?.message, ...(last.raw ? { raw: last.raw } : {}) } }
          }
        }
        return { ok: false as const, status: 500, json: { error: 'unexpected' } }
      }

      const tokenResult = await fetchWithRetry()
      if (!tokenResult.ok) {
        const status = tokenResult.status || 500
        // Surface structured details to help diagnose (includes raw HTML if returned by GitHub)
        return res.status(status >= 500 || status === 429 ? 503 : 401).json({ error: 'oauth_exchange_failed', details: tokenResult.json })
      }
      const tokenJson = tokenResult.json as any
      const accessToken = tokenJson.access_token as string

      // Fetch user login
      const userResp = await fetch('https://api.github.com/user', {
        headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'git-onchain-rewards' }
      })
      const user = await userResp.json() as any
      if (!user?.login) return res.status(401).json({ error: 'oauth_user_fetch_failed' })

      // Create oauth session token
      const bearer = randomToken('gh:')
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)
      await db.query(
        `INSERT INTO oauth_sessions (token, github_username, access_token, issued_at, expires_at)
         VALUES ($1,$2,$3,NOW(),$4)
         ON CONFLICT (token) DO UPDATE SET github_username = EXCLUDED.github_username, access_token = EXCLUDED.access_token, expires_at = EXCLUDED.expires_at`,
        [bearer, user.login, accessToken, expires]
      )

      // Redirect back to frontend if configured, else return JSON
      if (FRONTEND_ORIGIN) {
        const url = new URL(FRONTEND_ORIGIN)
        url.pathname = '/bind'
        url.searchParams.set('token', bearer)
        url.searchParams.set('username', user.login)
        return res.redirect(302, url.toString())
      }
      return res.json({ ok: true, token: bearer, username: user.login, expiresAt: expires.toISOString() })
    } catch (e: any) {
      console.error('[oauth/callback] error', e?.message || e)
      return res.status(500).json({ error: 'internal_error' })
    }
  })

  // 3) Attach wallet to authenticated GitHub user using OAuth bearer
  router.post('/bind/attach', async (req: Request, res: Response) => {
    try {
      const auth = req.header('Authorization') || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!token) return res.status(401).json({ error: 'missing_token' })
      const { wallet } = req.body as { wallet?: string }
      if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) return res.status(400).json({ error: 'bad_wallet' })

      const { rows } = await db.query(`SELECT github_username, expires_at FROM oauth_sessions WHERE token = $1`, [token])
      const sess = rows?.[0]
      if (!sess) return res.status(401).json({ error: 'bad_token' })
      if (sess.expires_at && new Date(sess.expires_at) < new Date()) return res.status(401).json({ error: 'token_expired' })

      const username = String(sess.github_username)
      await withTransaction(async (c) => {
        await c.query(`DELETE FROM users WHERE github_username = $1 OR LOWER(wallet_address) = LOWER($2)`, [username, wallet])
        await c.query(`INSERT INTO users (github_username, wallet_address, nonce) VALUES ($1, $2, NULL)`, [username, wallet])
      })
      return res.json({ ok: true, username, wallet })
    } catch (e: any) {
      console.error('[/bind/attach] error', e?.message || e)
      return res.status(500).json({ error: 'internal_error' })
    }
  })

  // 4) Return current GitHub user (requires valid OAuth bearer)
  router.get('/github/me', async (req: Request, res: Response) => {
    try {
      const auth = req.header('Authorization') || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!token) return res.status(401).json({ error: 'missing_token' })
      const { rows } = await db.query(`SELECT github_username, access_token, expires_at FROM oauth_sessions WHERE token = $1`, [token])
      const sess = rows?.[0]
      if (!sess) return res.status(401).json({ error: 'bad_token' })
      if (sess.expires_at && new Date(sess.expires_at) < new Date()) return res.status(401).json({ error: 'token_expired' })
      const accessToken = String(sess.access_token)
      const ures = await fetch('https://api.github.com/user', {
        headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'git-onchain-rewards' }
      })
      const user = await ures.json()
      if (!ures.ok) return res.status(ures.status).json(user)
      return res.json({ login: user.login, id: user.id, avatar_url: user.avatar_url, name: user.name })
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'internal_error' })
    }
  })

  // 5) List pull requests for a repo, optional author filter; auth via OAuth bearer or fallback GITHUB_TOKEN
  router.get('/github/prs', async (req: Request, res: Response) => {
    try {
      const repo = String((req.query.repo as string) || '')
      if (!repo.includes('/')) return res.status(400).json({ error: 'bad_repo' })
      const author = (req.query.author as string) || ''
      const state = (req.query.state as string) || 'all' // open|closed|all
      const merged = String(req.query.merged || '').toLowerCase() === 'true'
      const page = Math.max(1, Number(req.query.page || 1))
      const perPage = Math.min(100, Math.max(1, Number(req.query.per_page || 50)))

      // Resolve access token
      let ghAccess: string | null = null
      const auth = req.header('Authorization') || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (token) {
        const { rows } = await db.query(`SELECT access_token, expires_at FROM oauth_sessions WHERE token = $1`, [token])
        const sess = rows?.[0]
        if (sess && (!sess.expires_at || new Date(sess.expires_at) > new Date())) ghAccess = String(sess.access_token)
      }
      if (!ghAccess && process.env.GITHUB_TOKEN) ghAccess = process.env.GITHUB_TOKEN

      const [owner, name] = repo.split('/')
      const url = new URL(`https://api.github.com/repos/${owner}/${name}/pulls`)
      url.searchParams.set('state', state)
      url.searchParams.set('per_page', String(perPage))
      url.searchParams.set('page', String(page))
      // Using pulls list; includes user, created_at, updated_at, merged_at (nullable), html_url

      const ghRes = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/vnd.github+json',
          ...(ghAccess ? { 'Authorization': `Bearer ${ghAccess}` } : {}),
          'User-Agent': 'git-onchain-rewards'
        }
      })
      const raw = await ghRes.json()
      if (!ghRes.ok) return res.status(ghRes.status).json(raw)

      let items = Array.isArray(raw) ? raw : []
      if (author) items = items.filter((p: any) => (p?.user?.login || '').toLowerCase() === author.toLowerCase())
      if (merged) items = items.filter((p: any) => !!p?.merged_at)

      const prList = items.map((p: any) => ({
        id: p.id,
        number: p.number,
        title: p.title,
        login: p.user?.login,
        state: p.state,
        merged_at: p.merged_at,
        created_at: p.created_at,
        updated_at: p.updated_at,
        merge_commit_sha: p.merge_commit_sha,
        head_sha: p.head?.sha,
        html_url: p.html_url,
        repo_full_name: p.base?.repo?.full_name || repo,
      }))
      return res.json({ items: prList })
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'internal_error' })
    }
  })

  // 6) List PRs for the current OAuth user only (author is enforced from session)
  router.get('/github/my-prs', async (req: Request, res: Response) => {
    try {
      const repo = String((req.query.repo as string) || '')
      if (!repo.includes('/')) return res.status(400).json({ error: 'bad_repo' })
      const state = (req.query.state as string) || 'all' // open|closed|all
      const merged = String(req.query.merged || '').toLowerCase() === 'true'
      const page = Math.max(1, Number(req.query.page || 1))
      const perPage = Math.min(100, Math.max(1, Number(req.query.per_page || 50)))

      // Require OAuth bearer and resolve username + access token
      const auth = req.header('Authorization') || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!token) return res.status(401).json({ error: 'missing_token' })
      const { rows } = await db.query(`SELECT github_username, access_token, expires_at FROM oauth_sessions WHERE token = $1`, [token])
      const sess = rows?.[0]
      if (!sess) return res.status(401).json({ error: 'bad_token' })
      if (sess.expires_at && new Date(sess.expires_at) < new Date()) return res.status(401).json({ error: 'token_expired' })
      const username = String(sess.github_username)
      const accessToken = String(sess.access_token)

      const [owner, name] = repo.split('/')
      const url = new URL(`https://api.github.com/repos/${owner}/${name}/pulls`)
      url.searchParams.set('state', state)
      url.searchParams.set('per_page', String(perPage))
      url.searchParams.set('page', String(page))

      const ghRes = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'git-onchain-rewards'
        }
      })
      const raw = await ghRes.json()
      if (!ghRes.ok) return res.status(ghRes.status).json(raw)

      let items = Array.isArray(raw) ? raw : []
      items = items.filter((p: any) => (p?.user?.login || '').toLowerCase() === username.toLowerCase())
      if (merged) items = items.filter((p: any) => !!p?.merged_at)

      const prList = items.map((p: any) => ({
        id: p.id,
        number: p.number,
        title: p.title,
        login: p.user?.login,
        state: p.state,
        merged_at: p.merged_at,
        created_at: p.created_at,
        updated_at: p.updated_at,
        merge_commit_sha: p.merge_commit_sha,
        head_sha: p.head?.sha,
        html_url: p.html_url,
        repo_full_name: p.base?.repo?.full_name || repo,
      }))
      return res.json({ items: prList })
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'internal_error' })
    }
  })

  // 7) Owner view: list PRs for a repo only if the OAuth user has collaborator/maintainer/admin rights
  router.get('/github/owner-prs', async (req: Request, res: Response) => {
    try {
      const repo = String((req.query.repo as string) || '')
      if (!repo.includes('/')) return res.status(400).json({ error: 'bad_repo' })
      const author = (req.query.author as string) || ''
      const state = (req.query.state as string) || 'all'
      const merged = String(req.query.merged || '').toLowerCase() === 'true'
      const page = Math.max(1, Number(req.query.page || 1))
      const perPage = Math.min(100, Math.max(1, Number(req.query.per_page || 50)))

      // Require OAuth bearer and resolve access token
      const auth = req.header('Authorization') || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!token) return res.status(401).json({ error: 'missing_token' })
      const { rows } = await db.query(`SELECT access_token, expires_at FROM oauth_sessions WHERE token = $1`, [token])
      const sess = rows?.[0]
      if (!sess) return res.status(401).json({ error: 'bad_token' })
      if (sess.expires_at && new Date(sess.expires_at) < new Date()) return res.status(401).json({ error: 'token_expired' })
      const accessToken = String(sess.access_token)

      // Permission check on the repo
      const [owner, name] = repo.split('/')
      const permRes = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
        headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'git-onchain-rewards' }
      })
      const permJson = await permRes.json()
      if (!permRes.ok) return res.status(permRes.status).json(permJson)
      const perms = (permJson && permJson.permissions) || {}
      const allowed = !!(perms.admin || perms.maintain || perms.push)
      if (!allowed) return res.status(403).json({ error: 'not_repo_collaborator' })

      // List PRs
      const url = new URL(`https://api.github.com/repos/${owner}/${name}/pulls`)
      url.searchParams.set('state', state)
      url.searchParams.set('per_page', String(perPage))
      url.searchParams.set('page', String(page))
      const ghRes = await fetch(url.toString(), {
        headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'git-onchain-rewards' }
      })
      const raw = await ghRes.json()
      if (!ghRes.ok) return res.status(ghRes.status).json(raw)

      let items = Array.isArray(raw) ? raw : []
      if (author) items = items.filter((p: any) => (p?.user?.login || '').toLowerCase() === author.toLowerCase())
      if (merged) items = items.filter((p: any) => !!p?.merged_at)

      const prList = items.map((p: any) => ({
        id: p.id,
        number: p.number,
        title: p.title,
        login: p.user?.login,
        state: p.state,
        merged_at: p.merged_at,
        created_at: p.created_at,
        updated_at: p.updated_at,
        merge_commit_sha: p.merge_commit_sha,
        head_sha: p.head?.sha,
        html_url: p.html_url,
        repo_full_name: p.base?.repo?.full_name || repo,
      }))
      return res.json({ items: prList })
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'internal_error' })
    }
  })
}
