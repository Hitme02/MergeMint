/**
 * Hardhat configuration for git-onchain-rewards.
 * - Solidity ^0.8.19
 * - Networks: hardhat, localhost
 * - Ethers v6 + Chai matchers plugins enabled for scripts/tests
 */
require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true
    }
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545"
    }
    ,
    // For Docker Compose: other services can reach the Hardhat node at this hostname
    docker: {
      url: process.env.HARDHAT_RPC_URL || "http://hardhat-node:8545"
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 60000
  }
};
