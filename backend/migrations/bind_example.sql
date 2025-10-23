-- Quick SQL helper for demo wallet↔GitHub mapping.
-- Usage:
--   psql "$DATABASE_URL" -f backend/migrations/bind_example.sql

-- Example: create or update a mapping for GitHub 'octocat' to a demo wallet.
INSERT INTO users (github_username, wallet_address, nonce)
VALUES ('octocat', '0x1111111111111111111111111111111111111111', NULL)
ON CONFLICT (github_username)
DO UPDATE SET wallet_address = EXCLUDED.wallet_address, nonce = NULL, updated_at = NOW();

-- If you need to set/reset a nonce for 'octocat' (e.g., to test /bind/nonce + /bind/verify):
UPDATE users SET nonce = 'demo_nonce_123', updated_at = NOW() WHERE github_username = 'octocat';
