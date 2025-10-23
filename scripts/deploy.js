/* eslint-disable no-undef */
// Purpose: Deploy TestToken and ContributionRegistry to a local Hardhat network,
// set deployer as verifier, and fund the registry with sample ETH and tokens.
//
// Note: This script assumes the hardhat-ethers plugin (ethers v6) will be enabled in Step 3.
const hre = require("hardhat");

async function main() {
  const { ethers } = hre;

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Deploy TestToken
  const TestToken = await ethers.getContractFactory("TestToken");
  const token = await TestToken.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("TestToken deployed at:", tokenAddress);
  console.log(`TOKEN_ADDRESS=${tokenAddress}`);

  // Deploy ContributionRegistry
  const ContributionRegistry = await ethers.getContractFactory("ContributionRegistry");
  const registry = await ContributionRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("ContributionRegistry deployed at:", registryAddress);
  console.log(`REGISTRY_ADDRESS=${registryAddress}`);

  // Set deployer as verifier
  const tx1 = await registry.setVerifier(deployer.address, true);
  await tx1.wait();
  console.log("Verifier configured:", deployer.address);

  // Optionally set external verifier address (for backend wallet)
  const verifierPublic = process.env.VERIFIER_PUBLIC;
  if (verifierPublic) {
    const txv = await registry.setVerifier(verifierPublic, true);
    await txv.wait();
    console.log("Verifier configured:", verifierPublic);
  }

  // Fund registry with ETH and ERC-20 for demo claims
  const ethFund = ethers.parseEther("10");
  const tx2 = await deployer.sendTransaction({ to: registryAddress, value: ethFund });
  await tx2.wait();
  console.log("Funded registry with ETH:", ethFund.toString());

  const tokenFund = ethers.parseUnits("1000000", 18);
  const tx3 = await token.transfer(registryAddress, tokenFund);
  await tx3.wait();
  console.log("Funded registry with tokens:", tokenFund.toString());

  // If an external verifier is provided, fund them with some ETH for gas
  if (verifierPublic) {
    const ethForVerifier = ethers.parseEther("5");
    const txv2 = await deployer.sendTransaction({ to: verifierPublic, value: ethForVerifier });
    await txv2.wait();
    console.log("Funded verifier with ETH:", ethForVerifier.toString());
  }

  console.log("Deployment complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
