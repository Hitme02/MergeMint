/* eslint-disable no-unused-expressions */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ContributionRegistry", function () {
  let owner, verifier, alice, bob;
  let token, registry;

  const ZeroAddress = ethers.ZeroAddress;

  beforeEach(async function () {
    [owner, verifier, alice, bob] = await ethers.getSigners();

    const TestToken = await ethers.getContractFactory("TestToken");
    token = await TestToken.deploy();
    await token.waitForDeployment();

    const ContributionRegistry = await ethers.getContractFactory("ContributionRegistry");
    registry = await ContributionRegistry.deploy();
    await registry.waitForDeployment();

    // Set verifier
    await (await registry.setVerifier(await verifier.getAddress(), true)).wait();

    // Fund registry with ETH and ERC20 for claims
    await owner.sendTransaction({ to: await registry.getAddress(), value: ethers.parseEther("10") });
    await (await token.transfer(await registry.getAddress(), ethers.parseUnits("1000000", 18))).wait();
  });

  it("registers and claims a native (ETH) reward", async function () {
    const repo = "owner/repo";
    const commitHash = ethers.keccak256(ethers.toUtf8Bytes("commit-eth-1"));
    const id = await registry.computeId(repo, commitHash);

    const reward = ethers.parseEther("1");
    await (
      await registry.connect(verifier).registerContribution(
        id,
        await alice.getAddress(),
        repo,
        commitHash,
        "ipfs://evidence-eth-1",
        reward,
        0, // PayoutMode.NATIVE
        ZeroAddress
      )
    ).wait();

    // Ensure registered
    expect(await registry.isRegistered(id)).to.equal(true);

    const balBefore = await ethers.provider.getBalance(await registry.getAddress());
    await (await registry.connect(alice).claimReward(id)).wait();
    const balAfter = await ethers.provider.getBalance(await registry.getAddress());

    expect(balBefore - balAfter).to.equal(reward);

    const c = await registry.contributions(id);
    expect(c.claimed).to.equal(true);
  });

  it("registers and claims an ERC20 reward", async function () {
    const repo = "owner/repo2";
    const commitHash = ethers.keccak256(ethers.toUtf8Bytes("commit-erc20-1"));
    const id = await registry.computeId(repo, commitHash);

    const reward = ethers.parseUnits("1234", 18);
    await (
      await registry.connect(verifier).registerContribution(
        id,
        await bob.getAddress(),
        repo,
        commitHash,
        "ipfs://evidence-erc20-1",
        reward,
        1, // PayoutMode.ERC20
        await token.getAddress()
      )
    ).wait();

    // Token balance before
    const regBalBefore = await token.balanceOf(await registry.getAddress());
    const bobBefore = await token.balanceOf(await bob.getAddress());

    await (await registry.connect(bob).claimReward(id)).wait();

    const regBalAfter = await token.balanceOf(await registry.getAddress());
    const bobAfter = await token.balanceOf(await bob.getAddress());

    expect(regBalBefore - regBalAfter).to.equal(reward);
    expect(bobAfter - bobBefore).to.equal(reward);

    const c = await registry.contributions(id);
    expect(c.claimed).to.equal(true);
  });

  it("batch registers multiple contributions and claims one", async function () {
    const repoA = "org/repoA";
    const repoB = "org/repoB";
    const commitA = ethers.keccak256(ethers.toUtf8Bytes("commit-A"));
    const commitB = ethers.keccak256(ethers.toUtf8Bytes("commit-B"));

    const idA = await registry.computeId(repoA, commitA);
    const idB = await registry.computeId(repoB, commitB);

    const rewardA = ethers.parseEther("0.5");
    const rewardB = ethers.parseUnits("2500", 18);

    const ids = [idA, idB];
    const beneficiaries = [await alice.getAddress(), await bob.getAddress()];
    const repos = [repoA, repoB];
    const commits = [commitA, commitB];
    const evidences = ["ipfs://ev-A", "ipfs://ev-B"];
    const rewards = [rewardA, rewardB];
    const payoutModes = [0, 1]; // A: NATIVE, B: ERC20
    const tokens = [ZeroAddress, await token.getAddress()];

    await (
      await registry.connect(verifier).registerBatch(
        ids,
        beneficiaries,
        repos,
        commits,
        evidences,
        rewards,
        payoutModes,
        tokens
      )
    ).wait();

    // Verify both registered with correct beneficiaries
    const cA = await registry.contributions(idA);
    const cB = await registry.contributions(idB);
    expect(cA.beneficiary).to.equal(await alice.getAddress());
    expect(cB.beneficiary).to.equal(await bob.getAddress());
    expect(cA.claimed).to.equal(false);
    expect(cB.claimed).to.equal(false);

    // Claim A (native)
    const regEthBefore = await ethers.provider.getBalance(await registry.getAddress());
    await (await registry.connect(alice).claimReward(idA)).wait();
    const regEthAfter = await ethers.provider.getBalance(await registry.getAddress());
    expect(regEthBefore - regEthAfter).to.equal(rewardA);

    // Claim B (ERC20)
    const regTokBefore = await token.balanceOf(await registry.getAddress());
    await (await registry.connect(bob).claimReward(idB)).wait();
    const regTokAfter = await token.balanceOf(await registry.getAddress());
    expect(regTokBefore - regTokAfter).to.equal(rewardB);
  });

  it("reverts when non-verifier tries to register", async function () {
    const repo = "x/y";
    const commitHash = ethers.keccak256(ethers.toUtf8Bytes("unauth"));
    const id = await registry.computeId(repo, commitHash);

    await expect(
      registry.connect(alice).registerContribution(
        id,
        await alice.getAddress(),
        repo,
        commitHash,
        "ipfs://ev",
        ethers.parseEther("0.1"),
        0,
        ZeroAddress
      )
    ).to.be.revertedWithCustomError(registry, "NotVerifier");
  });
});
