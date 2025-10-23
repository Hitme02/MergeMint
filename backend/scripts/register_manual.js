const { ethers } = require('ethers');

function toBytes32FromSha(sha) {
  let hex = sha.startsWith('0x') ? sha.slice(2) : sha;
  if (hex.length === 64) return '0x' + hex;
  return ethers.keccak256(ethers.toUtf8Bytes(sha));
}

function computeId(repo, commitHashBytes32) {
  return ethers.solidityPackedKeccak256(['string', 'bytes32'], [repo, commitHashBytes32]);
}

async function main() {
  const argv = process.argv.slice(2);
  const getArg = (name, def) => {
    const i = argv.indexOf(`--${name}`);
    return i !== -1 && argv[i + 1] != null ? argv[i + 1] : def;
  };
  const repo = getArg('repo', 'accordproject/template-archive');
  const sha = getArg('sha', 'deadbeefcafebabe');
  const beneficiaryArg = getArg('beneficiary');
  if (!beneficiaryArg) throw new Error('missing --beneficiary');
  const beneficiary = ethers.getAddress(beneficiaryArg);
  const reward = String(getArg('reward', process.env.DEFAULT_REWARD || '1000000000000000'));
  const payoutStr = (getArg('payout', (process.env.DEFAULT_PAYOUT_MODE || 'NATIVE')) + '').toUpperCase();
  const payoutMode = payoutStr === 'ERC20' ? 1 : 0;
  const token = payoutMode === 1 ? (getArg('token', process.env.DEFAULT_TOKEN || ethers.ZeroAddress)) : ethers.ZeroAddress;

  const RPC_URL = process.env.RPC_URL || 'http://hardhat-node:8545';
  const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;
  const VERIFIER_PRIVATE_KEY = process.env.VERIFIER_PRIVATE_KEY;
  if (!REGISTRY_ADDRESS || !VERIFIER_PRIVATE_KEY) throw new Error('Missing REGISTRY_ADDRESS or VERIFIER_PRIVATE_KEY');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(VERIFIER_PRIVATE_KEY, provider);
  const abi = ['function registerContribution(bytes32,address,string,bytes32,string,uint256,uint8,address)'];
  const c = new ethers.Contract(REGISTRY_ADDRESS, abi, wallet);

  const commitHash = toBytes32FromSha(sha);
  const id = computeId(repo, commitHash);
  console.log('Registering id', id, 'repo', repo, 'commit', commitHash, 'beneficiary', beneficiary);
  const tx = await c.registerContribution(id, beneficiary, repo, commitHash, '', reward, payoutMode, token);
  const rec = await tx.wait();
  console.log('ok tx', rec.hash);
}

main().catch((e) => { console.error(e); process.exit(1); });
