import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import crypto from "crypto";
import { verifySignature } from "./github";
import { registerRoutes } from "./routes";
import { runMigrations, db } from "./db";
import { registerContribution as registerOnChain } from "./contract";
import { processPullRequest } from "./processPR";

/**
 * Express JSON body parser with raw body capture for GitHub signature verification.
 */
const rawBodySaver = (req: any, _res: any, buf: Buffer) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString("utf8");
  }
};

const app = express();
app.use(cors());
app.use(
  express.json({
    verify: rawBodySaver,
    limit: "2mb"
  })
);

const PORT = Number(process.env.PORT || 4000);
const GH_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";

// Simple health check — a small lighthouse for our local seas.
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// Root route: a tiny welcome sign to guide you.
app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "git-onchain-rewards — verifier",
    ok: true,
    ts: new Date().toISOString(),
    routes: [
      "GET /health",
      "POST /webhook",
      "POST /dev/webhook (dev only)",
      "POST /dev/bind (dev only)"
    ]
  });
});

/**
 * GitHub webhook endpoint.
 * Step 4: minimal skeleton — verifies signature and acknowledges.
 * Step 6 will expand this with policy checks, IPFS pinning, and on-chain registration.
 */
app.post("/webhook", async (req: Request & { rawBody?: string }, res: Response) => {
  try {
    // 1) Validate GitHub webhook signature (allow dev bypass when enabled and secret is not set)
  const allowDev = (process.env.ALLOW_DEV_WEBHOOK === "1" || process.env.ALLOW_DEV_WEBHOOK === "true");
  const headerBypass = String(req.header("X-Dev-Bypass") || req.header("x-dev-bypass") || "").toLowerCase() === "1";
  const devBypass = allowDev && (headerBypass || !process.env.GITHUB_WEBHOOK_SECRET);
  const valid = devBypass ? true : verifySignature(req);
    if (!valid) {
      return res.status(401).json({ error: "invalid_signature" });
    }

    // 2) Parse event type and payload
    const event = req.header("X-GitHub-Event") || req.header("x-github-event") || "unknown";
    const deliveryId = req.header("X-GitHub-Delivery") || req.header("x-github-delivery") || "";
    const payload = req.body;

    // Minimal log for visibility
    console.log(`[webhook] ${event} delivery=${deliveryId}`);

    // Step 6: process pull_request events
    if (event === "pull_request") {
      return await processPullRequest(req, res);
    }

    // Fallback acknowledge for other events
    return res.status(202).json({ received: true, event });
  } catch (err: any) {
    console.error("[webhook] error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

// Dev-only webhook bypass for local simulations
if (process.env.ALLOW_DEV_WEBHOOK === "1" || process.env.ALLOW_DEV_WEBHOOK === "true") {
  app.post("/dev/webhook", async (req: Request, res: Response) => {
    try {
      return await processPullRequest(req as any, res);
    } catch (e: any) {
      console.error("[/dev/webhook] error", e);
      return res.status(500).json({ error: "internal_error" });
    }
  });
}

// Dev-only bind bypass for local simulations (no signature required)
if (process.env.ALLOW_DEV_BIND === "1" || process.env.ALLOW_DEV_BIND === "true") {
  app.post("/dev/bind", async (req: Request, res: Response) => {
    try {
      const { username, wallet } = req.body as any;
      if (!username || !wallet) return res.status(400).json({ error: "missing_fields" });
      if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return res.status(400).json({ error: "bad_wallet" });
      try {
        await db.query(
          `INSERT INTO users (github_username, wallet_address, nonce)
           VALUES ($1, $2, NULL)
           ON CONFLICT (github_username) DO UPDATE SET wallet_address = EXCLUDED.wallet_address, nonce = NULL, updated_at = NOW()`,
          [username, wallet]
        );
      } catch (e: any) {
        // Handle unique violation on wallet_address by updating the existing row to new username
        if (e?.code === '23505') {
          await db.query(
            `UPDATE users SET github_username = $1, nonce = NULL, updated_at = NOW() WHERE wallet_address = $2`,
            [username, wallet]
          );
        } else {
          throw e;
        }
      }
      return res.json({ ok: true, username, wallet });
    } catch (e: any) {
      console.error("[/dev/bind] error", e?.message || e);
      return res.status(500).json({ error: "internal_error" });
    }
  });
}

// Register additional routes (bind endpoints and optional webhook mount)
registerRoutes(app);

async function main() {
  // Run DB migrations on boot (idempotent)
  await runMigrations();

  app.listen(PORT, () => {
    console.log(`Verifier listening at http://localhost:${PORT}`);

    // Optional self-test: ping /health and send a signed /webhook to demonstrate functionality locally
    if (process.env.SELF_TEST) {
      (async () => {
        try {
          // Small delay to ensure server is accepting connections
          await new Promise((r) => setTimeout(r, 200));

          // 1) /health
          const healthRes = await fetch(`http://localhost:${PORT}/health`);
          const healthJson = await healthRes.json().catch(() => ({}));
          console.log("[self-test] /health status=", healthRes.status, healthJson);

          // 2) /webhook with correct signature
          const body = JSON.stringify({ action: "closed", pull_request: { merged: true } });
          let sigHeader = "";
          if (GH_SECRET) {
            const hmac = crypto.createHmac("sha256", GH_SECRET);
            hmac.update(body, "utf8");
            sigHeader = `sha256=${hmac.digest("hex")}`;
          }

          const whRes = await fetch(`http://localhost:${PORT}/webhook`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-GitHub-Event": "pull_request",
              ...(sigHeader ? { "X-Hub-Signature-256": sigHeader } : {})
            },
            body
          });
          const whJson = await whRes.json().catch(() => ({}));
          console.log("[self-test] /webhook status=", whRes.status, whJson);
        } catch (e) {
          console.error("[self-test] error:", e);
        }
      })();
    }
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
