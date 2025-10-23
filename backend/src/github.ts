import crypto from "crypto";
import type { Request } from "express";

const GH_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";
const GH_TOKEN = process.env.GITHUB_TOKEN || "";

/**
 * Verify the GitHub webhook signature (X-Hub-Signature-256) against the raw body.
 * Returns true if valid.
 */
export function verifySignature(req: Request & { rawBody?: string }): boolean {
  try {
    const sigHeader = (req.header("X-Hub-Signature-256") || req.header("x-hub-signature-256") || "").toString();
    if (!sigHeader.startsWith("sha256=")) return false;
    const received = sigHeader.slice("sha256=".length);

    if (!req.rawBody || !GH_SECRET) return false;

    const hmac = crypto.createHmac("sha256", GH_SECRET);
    hmac.update(req.rawBody, "utf8");
    const digest = hmac.digest("hex");

    const a = Buffer.from(received, "hex");
    const b = Buffer.from(digest, "hex");
    if (a.length !== b.length) return false;

    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Fetch PR details from GitHub API.
 * repo: "owner/name"
 * prNumber: number
 */
export async function fetchPRDetails(repo: string, prNumber: number): Promise<any> {
  const url = `https://api.github.com/repos/${repo}/pulls/${prNumber}`;
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "git-onchain-rewards"
  };
  if (GH_TOKEN) headers["Authorization"] = `Bearer ${GH_TOKEN}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub PR fetch failed: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * Fetch commit status/checks.
 * Note: GitHub API needs the repo context; provide repo when available.
 * If repo is omitted, returns null (placeholder).
 */
export async function fetchCommitStatus(commitSha: string, repo?: string): Promise<any | null> {
  if (!repo) {
    // Placeholder until repo context is threaded through (Step 6).
    return null;
  }
  const url = `https://api.github.com/repos/${repo}/commits/${commitSha}/status`;
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "git-onchain-rewards"
  };
  if (GH_TOKEN) headers["Authorization"] = `Bearer ${GH_TOKEN}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub status fetch failed: ${res.status} ${text}`);
  }
  return res.json();
}
