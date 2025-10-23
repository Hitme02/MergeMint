-- Users table: binds GitHub identity to a wallet address
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  github_username TEXT UNIQUE NOT NULL,
  wallet_address TEXT UNIQUE,
  nonce TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contributions table: mirrors on-chain registrations with useful metadata
CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY,                 -- bytes32 hex string
  repo TEXT NOT NULL,                  -- "owner/name"
  commit_hash TEXT NOT NULL,           -- hex or full SHA
  beneficiary TEXT NOT NULL,           -- wallet address
  evidence_uri TEXT,
  reward NUMERIC NOT NULL,
  payout_mode TEXT NOT NULL,           -- 'NATIVE' | 'ERC20'
  token_address TEXT,
  registrar TEXT,                      -- verifier wallet address
  tx_hash TEXT,                        -- on-chain tx hash
  claimed BOOLEAN DEFAULT FALSE,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  author_github TEXT
);

CREATE INDEX IF NOT EXISTS idx_contributions_beneficiary ON contributions (beneficiary);
CREATE INDEX IF NOT EXISTS idx_contributions_repo ON contributions (repo);

-- Simple updated_at trigger for users (optional in dev)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Roles: assign roles to wallet addresses (e.g., 'owner')
CREATE TABLE IF NOT EXISTS user_roles (
  wallet_address TEXT NOT NULL,
  role TEXT NOT NULL,
  repo TEXT, -- optional scoping to specific repo (owner/name)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (wallet_address, role, repo)
);

-- Sessions: simple bearer tokens issued after wallet signature auth
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Repo schemas: configurable reward rules per repo by owners
CREATE TABLE IF NOT EXISTS repo_schemas (
  repo TEXT PRIMARY KEY,
  min_loc INTEGER DEFAULT 5,
  payout_mode TEXT NOT NULL DEFAULT 'NATIVE', -- 'NATIVE' | 'ERC20'
  reward NUMERIC NOT NULL DEFAULT 1000000000000000, -- default wei
  token_address TEXT,
  updated_by TEXT, -- wallet address
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- OAuth sessions for GitHub
CREATE TABLE IF NOT EXISTS oauth_sessions (
  token TEXT PRIMARY KEY,
  github_username TEXT NOT NULL,
  access_token TEXT,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);
