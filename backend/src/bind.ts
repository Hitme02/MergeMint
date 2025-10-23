import crypto from "crypto";
import type { Request, Response, Router } from "express";
import { ethers } from "ethers";
import { db, withTransaction } from "./db";

/**
 * Binding flow (minimal, local-friendly):
 *
 * 1) POST /bind/nonce
 *    - body: { github: "username" }
 *    - action: generates a fresh nonce for this GitHub user and stores it in DB
 *    - returns: { github, nonce, messageToSign }
 *
 * 2) POST /bind/verify
 *    - body: {
 *        github: "username",
 *        wallet: "0xabc...",
 *        signature: "0x...",
 *        gistUrl?: "https://gist.github.com/...",
 *        commentUrl?: "https://github.com/.../pull/123#issuecomment-..."
 *      }
 *    - action:
 *        a) fetches the stored nonce for this github user
 *        b) reconstructs the message and verifies the signature recovers `wallet`
 *        c) (TODO Step 6) optionally fetch gist/comment and validate it references wallet+nonce
 *        d) upserts users(github_username -> wallet_address), clears nonce
 *    - returns: { bound: true, github, wallet }
 */

const SIGNING_PREFIX = "git-onchain-rewards:bind";

function buildMessage(github: string, nonce: string) {
  // Structured, explicit message to avoid ambiguity.
  return `${SIGNING_PREFIX}\nusername:${github}\nnonce:${nonce}`;
}

export function mountBindRoutes(router: Router) {
  // POST /bind/nonce
  router.post("/bind/nonce", async (req: Request, res: Response) => {
    try {
      const { github } = req.body as { github?: string };
      if (!github || typeof github !== "string") {
        return res.status(400).json({ error: "invalid_github_username" });
      }

      const nonce = crypto.randomBytes(16).toString("hex");

      // Upsert nonce for this GitHub user
      await db.query(
        `
        INSERT INTO users (github_username, nonce)
        VALUES ($1, $2)
        ON CONFLICT (github_username)
        DO UPDATE SET nonce = EXCLUDED.nonce, updated_at = NOW()
        `,
        [github, nonce]
      );

      const messageToSign = buildMessage(github, nonce);
      return res.json({ github, nonce, messageToSign });
    } catch (err: any) {
      console.error("[bind/nonce] error:", err);
      return res.status(500).json({ error: "internal_error" });
    }
  });

  // POST /bind/verify
  router.post("/bind/verify", async (req: Request, res: Response) => {
    try {
      const { github, wallet, signature, gistUrl, commentUrl } = req.body as {
        github?: string;
        wallet?: string;
        signature?: string;
        gistUrl?: string;
        commentUrl?: string;
      };

      if (!github || typeof github !== "string") {
        return res.status(400).json({ error: "invalid_github_username" });
      }
      if (!wallet || !ethers.isAddress(wallet)) {
        return res.status(400).json({ error: "invalid_wallet_address" });
      }
      if (!signature || typeof signature !== "string") {
        return res.status(400).json({ error: "invalid_signature" });
      }

      // 1) Load nonce from DB
      const { rows } = await db.query(
        `SELECT nonce FROM users WHERE github_username = $1`,
        [github]
      );
      const storedNonce = rows?.[0]?.nonce as string | undefined;
      if (!storedNonce) {
        return res.status(400).json({ error: "nonce_not_found" });
      }

      // 2) Reconstruct signed message and verify
      const message = buildMessage(github, storedNonce);
      let recovered: string;
      try {
        recovered = ethers.verifyMessage(message, signature);
      } catch {
        return res.status(400).json({ error: "bad_signature" });
      }

      if (ethers.getAddress(recovered) !== ethers.getAddress(wallet)) {
        return res.status(400).json({ error: "signature_wallet_mismatch" });
      }

      // 3) (TODO Step 6) Validate gistUrl/commentUrl content and authorship against `github`.
      if (gistUrl || commentUrl) {
        console.log("[bind/verify] provided proof:", { gistUrl, commentUrl });
      }

      // 4) Upsert mapping, clear nonce; resolve unique conflicts via small transaction
      const addr = ethers.getAddress(wallet)
      await withTransaction(async (c) => {
        // Remove any conflicting rows first (by username or wallet)
        await c.query(`DELETE FROM users WHERE github_username = $1 OR LOWER(wallet_address) = LOWER($2)`, [github, addr])
        // Insert fresh mapping
        await c.query(`INSERT INTO users (github_username, wallet_address, nonce) VALUES ($1, $2, NULL)`, [github, addr])
      })

      return res.json({ bound: true, github, wallet: ethers.getAddress(wallet) });
    } catch (err: any) {
      console.error("[bind/verify] error:", err);
      return res.status(500).json({ error: "internal_error" });
    }
  });
}
