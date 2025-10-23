import { ethers } from "ethers";

export enum PayoutMode {
  NATIVE = 0,
  ERC20 = 1
}

const ABI = [
  // Only the function we need for now. Expand as needed.
  "function registerContribution(bytes32 id,address beneficiary,string repo,bytes32 commitHash,string evidenceURI,uint256 reward,uint8 payoutMode,address token)"
];

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS || ethers.ZeroAddress;
const ENABLE_ONCHAIN = String(process.env.ENABLE_ONCHAIN || '').toLowerCase();
const VERIFIER_PRIVATE_KEY = process.env.VERIFIER_PRIVATE_KEY || "";

if (!VERIFIER_PRIVATE_KEY) {
  console.warn("[contract] VERIFIER_PRIVATE_KEY is empty — on-chain register calls will fail.");
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = VERIFIER_PRIVATE_KEY ? new ethers.Wallet(VERIFIER_PRIVATE_KEY, provider) : null;
const contract = REGISTRY_ADDRESS && wallet ? new ethers.Contract(REGISTRY_ADDRESS, ABI, wallet) : null;

export type RegisterArgs = {
  id: string; // 0x bytes32
  beneficiary: string;
  repo: string;
  commitHash: string; // 0x bytes32
  evidenceURI: string;
  reward: string; // as string to avoid float issues, e.g. parsed units
  payoutMode: PayoutMode;
  token: string; // 0x token address or 0x0 for native
};

/**
 * Register a contribution on-chain.
 * Returns the transaction hash.
 */
export async function registerContribution(args: RegisterArgs): Promise<string> {
  if (!contract || !wallet) throw new Error("Contract or wallet not initialized");
  const tx = await contract.registerContribution(
    args.id,
    args.beneficiary,
    args.repo,
    args.commitHash,
    args.evidenceURI,
    args.reward,
    args.payoutMode,
    args.token
  );
  const rec = await tx.wait();
  return rec?.hash ?? tx.hash;
}

// Optional helper to compute the same id as the contract (keccak256(repo, commitHash))
export function computeId(repo: string, commitHashBytes32: string): string {
  return ethers.solidityPackedKeccak256(["string", "bytes32"], [repo, commitHashBytes32]);
}

export function canRegisterOnChain(): boolean {
  // Requires explicit opt-in via ENABLE_ONCHAIN=true and proper config
  if (!(ENABLE_ONCHAIN === 'true' || ENABLE_ONCHAIN === '1')) return false;
  return !!contract && !!wallet && REGISTRY_ADDRESS !== ethers.ZeroAddress;
}

export function getVerifierAddress(): string | null {
  return wallet?.address ?? null;
}
