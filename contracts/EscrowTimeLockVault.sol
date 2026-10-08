// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract EscrowTimeLockVault {

    // ─────────────────────────────────────────────
    // STATE — equivalent to VaultState PDA in Solana
    // ─────────────────────────────────────────────

    struct Vault {
        address owner;        // Person A
        address receiver;     // Person B
        uint256 lockUntil;    // Unix timestamp when funds unlock
        uint256 totalDeposited;
        bool    isCancelled;
        bool    exists;
    }

    // owner address → their vault
    // In Solana this was a PDA derived from owner pubkey
    // In Ethereum it's just a mapping
    mapping(address => Vault) public vaults;

    // ─────────────────────────────────────────────
    // EVENTS — like msg!() in Solana but queryable
    // ─────────────────────────────────────────────

    event VaultInitialized(address indexed owner, address indexed receiver, uint256 lockUntil);
    event Deposited(address indexed owner, uint256 amount);
    event Withdrawn(address indexed receiver, uint256 amount);
    event Cancelled(address indexed owner, uint256 amount);
    event VaultClosed(address indexed owner);

    // ─────────────────────────────────────────────
    // ERRORS — like #[error_code] in Solana
    // ─────────────────────────────────────────────

    error VaultAlreadyExists();
    error VaultDoesNotExist();
    error VaultStillLocked();
    error UnauthorizedReceiver();
    error EscrowCancelled();
    error VaultEmpty();
    error InvalidLockDuration();
    error ReceiverCannotBeOwner();
    error CannotCancelAfterUnlock();
    error InvalidAmount();

    // ─────────────────────────────────────────────
    // INITIALIZE — Person A creates the vault
    // ─────────────────────────────────────────────

    function initialize(uint256 lockDuration, address receiver) external {
        if (lockDuration == 0)              revert InvalidLockDuration();
        if (receiver == msg.sender)         revert ReceiverCannotBeOwner();
        if (vaults[msg.sender].exists)      revert VaultAlreadyExists();

        vaults[msg.sender] = Vault({
            owner:          msg.sender,
            receiver:       receiver,
            lockUntil:      block.timestamp + lockDuration,
            totalDeposited: 0,
            isCancelled:    false,
            exists:         true
        });

        emit VaultInitialized(msg.sender, receiver, block.timestamp + lockDuration);
    }

    // ─────────────────────────────────────────────
    // DEPOSIT — Person A sends ETH into the vault
    // ─────────────────────────────────────────────

    function deposit() external payable {
        Vault storage vault = vaults[msg.sender];

        if (!vault.exists)      revert VaultDoesNotExist();
        if (vault.isCancelled)  revert EscrowCancelled();
        if (msg.value == 0)     revert InvalidAmount();

        vault.totalDeposited += msg.value;

        emit Deposited(msg.sender, msg.value);
    }

    // ─────────────────────────────────────────────
    // WITHDRAW — Person B claims after lock expires
    // ─────────────────────────────────────────────

    function withdraw(address owner) external {
        Vault storage vault = vaults[owner];

        if (!vault.exists)                          revert VaultDoesNotExist();
        if (msg.sender != vault.receiver)           revert UnauthorizedReceiver();
        if (vault.isCancelled)                      revert EscrowCancelled();
        if (block.timestamp < vault.lockUntil)      revert VaultStillLocked();

        uint256 balance = address(this).balance;
        // NOTE: In a real multi-vault contract you'd track per-vault balance
        // Here we use totalDeposited as the amount owed
        uint256 amount = vault.totalDeposited;
        if (amount == 0)    revert VaultEmpty();

        vault.totalDeposited = 0; // prevent re-entrancy

        // Transfer ETH to receiver
        // In Solana this was system_program::transfer with PDA signer
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    // ─────────────────────────────────────────────
    // CANCEL — Person A cancels before lock expires
    // ─────────────────────────────────────────────

    function cancel() external {
        Vault storage vault = vaults[msg.sender];

        if (!vault.exists)                          revert VaultDoesNotExist();
        if (vault.isCancelled)                      revert EscrowCancelled();
        if (block.timestamp >= vault.lockUntil)     revert CannotCancelAfterUnlock();

        uint256 amount = vault.totalDeposited;
        if (amount == 0)    revert VaultEmpty();

        vault.totalDeposited = 0;
        vault.isCancelled    = true;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");

        emit Cancelled(msg.sender, amount);
    }

    // ─────────────────────────────────────────────
    // CLOSE — Person A deletes their vault
    // In Solana this recovered rent lamports
    // In Ethereum there's no rent — just cleanup
    // ─────────────────────────────────────────────

    function closeVault() external {
        Vault storage vault = vaults[msg.sender];
        if (!vault.exists)              revert VaultDoesNotExist();
        if (vault.totalDeposited > 0)   revert VaultEmpty(); // can't close with funds inside

        delete vaults[msg.sender];
        emit VaultClosed(msg.sender);
    }

    // ─────────────────────────────────────────────
    // VIEW HELPERS
    // ─────────────────────────────────────────────

    function getVault(address owner) external view returns (Vault memory) {
        return vaults[owner];
    }

    function getTimeRemaining(address owner) external view returns (uint256) {
        Vault memory vault = vaults[owner];
        if (block.timestamp >= vault.lockUntil) return 0;
        return vault.lockUntil - block.timestamp;
    }
}