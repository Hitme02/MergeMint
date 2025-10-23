// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title TestToken
 * @notice Simple ERC-20 token for local testing and demos.
 */
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestToken is ERC20, Ownable {
    constructor() ERC20("TestToken", "TST") {
        // Mint 1,000,000,000 TST to deployer for generous local testing.
        _mint(msg.sender, 1_000_000_000 ether);
    }

    /// @notice Owner can mint additional tokens for testing.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
