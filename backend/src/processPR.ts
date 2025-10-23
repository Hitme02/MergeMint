import { Request, Response } from "express";
import { ethers } from "ethers";
import { evaluatePolicy } from "./policy";
import { pinToIPFS } from "./ipfs";
import { computeId, registerContribution, PayoutMode, canRegisterOnChain, getVerifierAddress } from "./contract";
import { db } from "./db";

const DEFAULT_PAYOUT_MODE = (process.env.DEFAULT_PAYOUT_MODE || "NATIVE").toUpperCase();
const DEFAULT_REWARD = process.env.DEFAULT_REWARD || "0"; // in wei or token units
const DEFAULT_TOKEN = process.env.DEFAULT_TOKEN || ethers.ZeroAddress;

function toBytes32FromSha(sha: string): string {
  // Accept 40 or 64 hex (GitHub SHA); convert to bytes32 by hashing or padding.
  let hex = sha.startsWith("0x") ? sha.slice(2) : sha;
  if (hex.length === 64) return "0x" + hex;
  // Fallback: keccak of the provided sha string
  return ethers.keccak256(ethers.toUtf8Bytes(sha));
}

export async function processPullRequest(req: Request, res: Response) {
  const payload = req.body as any;
  if (!payload || !payload.pull_request) return res.status(400).json({ error: "bad_payload" });

  // Prefer GitHub's canonical full_name for consistent storage/lookup
  const repo = payload?.repository?.full_name
    ? String(payload.repository.full_name)
    : `${payload.repository?.owner?.login || payload.organization?.login}/${payload.repository?.name}`;
  const prNumber = payload.number || payload.pull_request.number;
  const merged = !!payload.pull_request.merged;
  const action = payload.action;
  // For merged PRs, prefer the merge_commit_sha to match the UI/client ID computation
  const headSha = (merged && payload.pull_request?.merge_commit_sha) || payload.pull_request?.head?.sha || "";
  const additions = payload.pull_request?.additions ?? undefined;
  const deletions = payload.pull_request?.deletions ?? undefined;
  const author = payload.pull_request?.user?.login || undefined;

  console.log(`[processPR] repo=${repo} pr=${prNumber} action=${action} merged=${merged} author=${author} sha=${headSha?.slice(0,10)}`)

  // Load optional repo schema
  const schemaRow = await db.query(`SELECT min_loc, payout_mode, reward, token_address FROM repo_schemas WHERE LOWER(repo) = LOWER($1)`, [repo]).then(r => r.rows?.[0]).catch(() => null)

  // Policy evaluation (min_loc from schema if set)
  const prevMin = process.env.MIN_LOC
  if (schemaRow?.min_loc != null) process.env.MIN_LOC = String(schemaRow.min_loc)
  const policy = await evaluatePolicy({ action, repo, prNumber, merged, headSha, additions, deletions, minLoc: schemaRow?.min_loc ?? undefined });
  if (prevMin != null) process.env.MIN_LOC = prevMin
  if (!policy.ok) {
    console.log(`[processPR] policy_reject repo=${repo} pr=${prNumber} reasons=${(policy.reasons||[]).join(',')}`)
    return res.status(202).json({ received: true, accepted: false, reasons: policy.reasons });
  }

  // Map PR author to wallet (simple lookup)
  let beneficiary: string | null = null;
  if (author) {
    const r = await db.query(`SELECT wallet_address FROM users WHERE github_username = $1`, [author]);
    beneficiary = r.rows?.[0]?.wallet_address || null;
  }
  if (!beneficiary || !ethers.isAddress(beneficiary)) {
    console.log(`[processPR] no_bound_wallet repo=${repo} pr=${prNumber} author=${author}`)
    return res.status(202).json({ received: true, accepted: false, reasons: ["no_bound_wallet_for_author"], author });
  }

  // Build evidence
  const evidence = {
    repo,
    commitHash: headSha,
    author,
    prNumber,
    metadata: { additions, deletions, policy: policy.details }
  };
  const evidenceURI = await pinToIPFS(evidence);

  // Compute IDs and prepare on-chain args
  const commitHashBytes32 = toBytes32FromSha(headSha);
  const id = computeId(repo, commitHashBytes32);
  const payoutMode = (schemaRow?.payout_mode || DEFAULT_PAYOUT_MODE) === "ERC20" ? PayoutMode.ERC20 : PayoutMode.NATIVE;
  const reward = String(schemaRow?.reward ?? DEFAULT_REWARD);
  const token = payoutMode === PayoutMode.ERC20 ? (schemaRow?.token_address || DEFAULT_TOKEN) : ethers.ZeroAddress;

  // Optionally call on-chain
  let txHash: string | null = null;
  if (canRegisterOnChain()) {
    try {
      txHash = await registerContribution({
        id,
        beneficiary,
        repo,
        commitHash: commitHashBytes32,
        evidenceURI,
        reward,
        payoutMode,
        token
      });
    } catch (e: any) {
      console.error("[processPR] on-chain register failed:", e?.message || e);
      // Continue to persist off-chain record even if on-chain fails
    }
  }

  // Persist to DB
  try {
    await db.query(
      `INSERT INTO contributions (id, repo, commit_hash, beneficiary, evidence_uri, reward, payout_mode, token_address, registrar, tx_hash, claimed, author_github)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        repo,
        commitHashBytes32,
        beneficiary,
        evidenceURI,
        reward,
        payoutMode === PayoutMode.ERC20 ? "ERC20" : "NATIVE",
        token,
        getVerifierAddress(),
        txHash,
        false,
        author
      ]
    );
  } catch (e: any) {
    console.error("[processPR] db insert failed:", e?.message || e);
  }

  console.log(`[processPR] accepted repo=${repo} pr=${prNumber} id=${id} payout=${payoutMode===PayoutMode.ERC20?'ERC20':'NATIVE'} reward=${reward} tx=${txHash||'n/a'}`)
  return res.status(201).json({
    accepted: true,
    id,
    repo,
    commitHash: commitHashBytes32,
    beneficiary,
    evidenceURI,
    reward,
    payoutMode: payoutMode === PayoutMode.ERC20 ? "ERC20" : "NATIVE",
    txHash
  });
}
