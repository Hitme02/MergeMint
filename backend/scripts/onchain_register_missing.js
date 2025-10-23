// Registers any DB contributions missing an on-chain tx for a given beneficiary.
// Usage inside backend container:
//   node scripts/onchain_register_missing.js --beneficiary 0xYourAddress

const { ethers } = require('ethers');
const { Client } = require('pg');

async function main() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--beneficiary');
  if (idx === -1 || !args[idx + 1]) {
    console.error('Usage: node scripts/onchain_register_missing.js --beneficiary 0x...');
    process.exit(1);
  }
  const beneficiary = ethers.getAddress(args[idx + 1]);

  const RPC_URL = process.env.RPC_URL || 'http://hardhat-node:8545';
  const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;
  const VERIFIER_PRIVATE_KEY = process.env.VERIFIER_PRIVATE_KEY;
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!REGISTRY_ADDRESS || !VERIFIER_PRIVATE_KEY || !DATABASE_URL) {
    throw new Error('Missing env: REGISTRY_ADDRESS, VERIFIER_PRIVATE_KEY, or DATABASE_URL');
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(VERIFIER_PRIVATE_KEY, provider);
  const abi = [
    'function registerContribution(bytes32 id,address beneficiary,string repo,bytes32 commitHash,string evidenceURI,uint256 reward,uint8 payoutMode,address token)'
  ];
  const c = new ethers.Contract(REGISTRY_ADDRESS, abi, wallet);

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  const { rows } = await db.query(
    `SELECT id, repo, commit_hash, beneficiary, evidence_uri, reward, payout_mode, token_address, COALESCE(tx_hash,'') AS tx_hash
     FROM contributions
     WHERE lower(beneficiary) = lower($1)
     ORDER BY registered_at DESC
     LIMIT 20`,
    [beneficiary]
  );

  if (!rows.length) {
    console.log('No contributions found for', beneficiary);
    await db.end();
    return;
  }

  for (const it of rows) {
    if (it.tx_hash) {
      console.log('Already on-chain:', it.id, it.tx_hash);
      continue;
    }
    const payoutMode = String(it.payout_mode || 'NATIVE').toUpperCase() === 'ERC20' ? 1 : 0;
    const token = payoutMode === 1 ? (it.token_address || ethers.ZeroAddress) : ethers.ZeroAddress;
    console.log('Registering on-chain:', { id: it.id, repo: it.repo, commit: it.commit_hash, reward: it.reward, payoutMode, token });
    try {
      const tx = await c.registerContribution(
        it.id,
        ethers.getAddress(it.beneficiary),
        it.repo,
        it.commit_hash,
        it.evidence_uri || '',
        it.reward,
        payoutMode,
        token
      );
      const rec = await tx.wait();
      console.log('OK tx:', rec.hash);
      await db.query('UPDATE contributions SET tx_hash = $1 WHERE id = $2', [rec.hash, it.id]);
    } catch (e) {
      console.error('Register failed for id', it.id, e.reason || e.message || e);
    }
  }

  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
