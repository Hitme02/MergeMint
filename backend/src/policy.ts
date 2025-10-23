import { fetchCommitStatus, fetchPRDetails } from "./github";

export type PolicyResult = {
  ok: boolean;
  reasons?: string[];
  details?: any;
};

export type PolicyInput = {
  action: string;
  repo: string; // owner/name
  prNumber: number;
  merged: boolean;
  headSha: string;
  additions?: number;
  deletions?: number;
  minLoc?: number; // optional override per-repo
};

export async function evaluatePolicy(input: PolicyInput): Promise<PolicyResult> {
  const MIN_LOC_DEFAULT = Number((input.minLoc ?? process.env.MIN_LOC) || 5);
  const reasons: string[] = [];
  if (input.action !== "closed") reasons.push("action_not_closed");
  if (!input.merged) reasons.push("pr_not_merged");

  // Basic LOC threshold (additions minus deletions could be negative; use additions as lower bound)
  const loc = Math.max(0, input.additions ?? 0);
  if (loc < MIN_LOC_DEFAULT) reasons.push(`loc_below_min(${loc}<${MIN_LOC_DEFAULT})`);

  // CI status (best-effort): only enforce if there are any statuses reported
  try {
    const status = await fetchCommitStatus(input.headSha, input.repo);
    if (status && typeof status.state === 'string') {
      const total = Number((status as any).total_count || (Array.isArray((status as any).statuses) ? (status as any).statuses.length : 0));
      if (total > 0 && status.state !== "success") {
        reasons.push(`ci_status_not_success(${status.state})`);
      }
    }
  } catch (e) {
    // Non-fatal in dev
  }

  return {
    ok: reasons.length === 0,
    reasons,
    details: { loc }
  };
}
