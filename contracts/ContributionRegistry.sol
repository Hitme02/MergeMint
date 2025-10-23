// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ContributionRegistry
 * @notice Registers verified open-source contributions and lets contributors claim rewards.
 * @dev Ownable (owner can manage verifiers and pause), Pausable (emergency stop), ReentrancyGuard (secure claims).
 * - Id is computed as keccak256(abi.encodePacked(repo, commitHash)).
 * - Rewards can be paid in native ETH or ERC-20 tokens.
 * - Only designated verifiers (or owner) can register contributions.
 *
 * Security notes:
 * - Keep owner as a multisig in production.
 * - Fund the contract with sufficient ETH/ERC-20 before claims.
 */
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ContributionRegistry is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice How rewards are paid out.
    enum PayoutMode {
        NATIVE, // native ETH
        ERC20   // ERC-20 token
    }

    /// @notice Immutable record of a contribution registered by a verifier.
    struct Contribution {
        address beneficiary;       // wallet to receive reward
        string repo;               // "owner/name"
        bytes32 commitHash;        // commit hash (bytes32 truncated or full keccak)
        string evidenceURI;        // IPFS/HTTP(S) URI with evidence bundle
        uint256 reward;            // amount to pay
        PayoutMode payoutMode;     // native or ERC-20
        address token;             // token address if ERC-20 mode, else zero
        bool claimed;              // has the reward been claimed
        uint64 registeredAt;       // block timestamp when registered
        address registrar;         // verifier who registered this
    }

    /// @notice Contribution id => record
    mapping(bytes32 => Contribution) public contributions;

    /// @notice Verifier allowlist
    mapping(address => bool) public verifiers;

    // ========== Events ==========

    /// @notice Emitted when a verifier is added/removed.
    event VerifierUpdated(address indexed account, bool allowed);

    /// @notice Emitted when a contribution is registered.
    event ContributionRegistered(
        bytes32 indexed id,
        address indexed beneficiary,
        string repo,
        bytes32 commitHash,
        string evidenceURI,
        uint256 reward,
        PayoutMode payoutMode,
        address token,
        address indexed registrar
    );

    /// @notice Emitted when a contributor claims their reward.
    event RewardClaimed(
        bytes32 indexed id,
        address indexed beneficiary,
        uint256 amount,
        PayoutMode payoutMode,
        address token
    );

    /// @notice Emitted when a batch of contributions is registered.
    event BatchRegistered(uint256 count, address indexed registrar);

    // ========== Custom Errors ==========

    error NotVerifier();
    error AlreadyRegistered();
    error NotBeneficiary();
    error AlreadyClaimed();
    error InvalidId();
    error InsufficientFunds();
    error LengthMismatch();

    // ========== Constructor ==========

    constructor() {
        // Ownable default owner is deployer in OZ v4
    }

    // ========== Admin ==========

    /// @notice Add/remove a verifier allowed to register contributions.
    function setVerifier(address account, bool allowed) external onlyOwner {
        verifiers[account] = allowed;
        emit VerifierUpdated(account, allowed);
    }

    /// @notice Pause the contract (disable register & claim).
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause the contract.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Sweep native ETH to a destination (owner-only).
    function sweepNative(address payable to, uint256 amount) external onlyOwner {
        Address.sendValue(to, amount);
    }

    /// @notice Sweep ERC-20 to a destination (owner-only).
    function sweepToken(IERC20 token, address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
    }

    // ========== Funding Helpers ==========

    /// @notice Allow anyone to deposit ERC-20 into the registry (e.g., to fund rewards).
    function fundToken(IERC20 token, uint256 amount) external {
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @dev Receive native ETH.
    receive() external payable {}

    // ========== Core Logic ==========

    /**
     * @notice Compute the canonical id for a contribution: keccak256(abi.encodePacked(repo, commitHash)).
     * @param repo The GitHub repo string "owner/name".
     * @param commitHash The canonical bytes32 representation of the commit hash (off-chain must derive consistently).
     */
    function computeId(string memory repo, bytes32 commitHash) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(repo, commitHash));
    }

    /**
     * @notice Register a single contribution (verifier-only).
     * @param id Off-chain computed id (must equal computeId(repo, commitHash)).
     * @param beneficiary Wallet to receive rewards.
     * @param repo GitHub repo "owner/name".
     * @param commitHash Bytes32 commit hash.
     * @param evidenceURI IPFS/URL with verification bundle.
     * @param reward Amount to be paid upon claim.
     * @param payoutMode NATIVE or ERC20.
     * @param token Token address if ERC20 mode (ignored for NATIVE).
     */
    function registerContribution(
        bytes32 id,
        address beneficiary,
        string calldata repo,
        bytes32 commitHash,
        string calldata evidenceURI,
        uint256 reward,
        PayoutMode payoutMode,
        address token
    ) external whenNotPaused {
        if (!(verifiers[msg.sender] || msg.sender == owner())) revert NotVerifier();
        if (id != computeId(repo, commitHash)) revert InvalidId();
        if (contributions[id].beneficiary != address(0)) revert AlreadyRegistered();

        contributions[id] = Contribution({
            beneficiary: beneficiary,
            repo: repo,
            commitHash: commitHash,
            evidenceURI: evidenceURI,
            reward: reward,
            payoutMode: payoutMode,
            token: payoutMode == PayoutMode.ERC20 ? token : address(0),
            claimed: false,
            registeredAt: uint64(block.timestamp),
            registrar: msg.sender
        });

        emit ContributionRegistered(
            id,
            beneficiary,
            repo,
            commitHash,
            evidenceURI,
            reward,
            payoutMode,
            payoutMode == PayoutMode.ERC20 ? token : address(0),
            msg.sender
        );
    }

    /**
     * @notice Batch register contributions (verifier-only).
     * @dev All arrays must have equal length.
     */
    function registerBatch(
        bytes32[] calldata ids,
        address[] calldata beneficiaries,
        string[] calldata repos,
        bytes32[] calldata commitHashes,
        string[] calldata evidenceURIs,
        uint256[] calldata rewards,
        PayoutMode[] calldata payoutModes,
        address[] calldata tokens
    ) external whenNotPaused {
        if (!(verifiers[msg.sender] || msg.sender == owner())) revert NotVerifier();

        uint256 n = ids.length;
        if (
            beneficiaries.length != n ||
            repos.length != n ||
            commitHashes.length != n ||
            evidenceURIs.length != n ||
            rewards.length != n ||
            payoutModes.length != n ||
            tokens.length != n
        ) revert LengthMismatch();

        for (uint256 i = 0; i < n; i++) {
            if (ids[i] != computeId(repos[i], commitHashes[i])) revert InvalidId();
            if (contributions[ids[i]].beneficiary != address(0)) revert AlreadyRegistered();

            contributions[ids[i]] = Contribution({
                beneficiary: beneficiaries[i],
                repo: repos[i],
                commitHash: commitHashes[i],
                evidenceURI: evidenceURIs[i],
                reward: rewards[i],
                payoutMode: payoutModes[i],
                token: payoutModes[i] == PayoutMode.ERC20 ? tokens[i] : address(0),
                claimed: false,
                registeredAt: uint64(block.timestamp),
                registrar: msg.sender
            });

            emit ContributionRegistered(
                ids[i],
                beneficiaries[i],
                repos[i],
                commitHashes[i],
                evidenceURIs[i],
                rewards[i],
                payoutModes[i],
                payoutModes[i] == PayoutMode.ERC20 ? tokens[i] : address(0),
                msg.sender
            );
        }

        emit BatchRegistered(n, msg.sender);
    }

    /**
     * @notice Claim reward for a registered contribution.
     * @param id Contribution id.
     */
    function claimReward(bytes32 id) external nonReentrant whenNotPaused {
        Contribution storage c = contributions[id];
        if (c.beneficiary != msg.sender) revert NotBeneficiary();
        if (c.claimed) revert AlreadyClaimed();

        c.claimed = true;

        if (c.payoutMode == PayoutMode.NATIVE) {
            if (address(this).balance < c.reward) revert InsufficientFunds();
            Address.sendValue(payable(msg.sender), c.reward);
            emit RewardClaimed(id, msg.sender, c.reward, PayoutMode.NATIVE, address(0));
        } else {
            IERC20(c.token).safeTransfer(msg.sender, c.reward);
            emit RewardClaimed(id, msg.sender, c.reward, PayoutMode.ERC20, c.token);
        }
    }

    // ========== Views ==========

    /// @notice Returns whether an id is already registered.
    function isRegistered(bytes32 id) external view returns (bool) {
        return contributions[id].beneficiary != address(0);
    }
}
