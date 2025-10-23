import axios from 'axios'

const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

export const api = axios.create({ baseURL: apiBase })

export async function getNonce(username: string) {
  const res = await api.post('/bind/nonce', { github: username })
  return res.data
}

export async function verifyBind(username: string, signature: string, address: string) {
  const res = await api.post('/bind/verify', { github: username, signature, wallet: address })
  return res.data
}

export async function listContributions(beneficiary: string) {
  const res = await api.get('/contributions', { params: { beneficiary } })
  return res.data.items || []
}

export async function devBind(username: string, wallet: string) {
  const res = await api.post('/dev/bind', { username, wallet })
  return res.data
}

export async function devWebhook(payload: any) {
  const res = await api.post('/dev/webhook', payload)
  return res.data
}

// GitHub helpers via backend
export async function githubMe(token: string) {
  const res = await api.get('/github/me', { headers: { Authorization: `Bearer ${token}` } })
  return res.data
}

export async function githubPRs(params: { repo: string; author?: string; state?: 'open'|'closed'|'all'; merged?: boolean; page?: number; per_page?: number }, token?: string) {
  const res = await api.get('/github/prs', {
    params,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  })
  return res.data.items || []
}

// Session-scoped: always returns PRs for the OAuth user associated with the bearer
export async function githubMyPRs(params: { repo: string; state?: 'open'|'closed'|'all'; merged?: boolean; page?: number; per_page?: number }, token: string) {
  const res = await api.get('/github/my-prs', {
    params,
    headers: { Authorization: `Bearer ${token}` }
  })
  return res.data.items || []
}

// Owner-scoped: requires OAuth bearer, verifies collaborator/admin on repo
export async function githubOwnerPRs(params: { repo: string; author?: string; state?: 'open'|'closed'|'all'; merged?: boolean; page?: number; per_page?: number }, token: string) {
  const res = await api.get('/github/owner-prs', {
    params,
    headers: { Authorization: `Bearer ${token}` }
  })
  return res.data.items || []
}

// Owner action: register a merged PR by number for a repo
export async function ownerRegisterPR(repo: string, pr_number: number, ownerToken: string, ghToken: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${ownerToken}`,
    'Content-Type': 'application/json',
    'X-GitHub-Bearer': ghToken.startsWith('gh:') ? ghToken : `gh:${ghToken}`.replace(/^gh:gh:/, 'gh:')
  }
  const res = await api.post('/owner/register-pr', { repo, pr_number }, { headers })
  return res.data
}

export async function ownerSetupWebhook(repo: string, ownerToken: string, ghToken: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${ownerToken}`,
    'Content-Type': 'application/json',
    'X-GitHub-Bearer': ghToken.startsWith('gh:') ? ghToken : `gh:${ghToken}`.replace(/^gh:gh:/, 'gh:')
  }
  const res = await api.post('/owner/setup-webhook', { repo }, { headers })
  return res.data
}
