import { ethers } from "hardhat";
import { expect } from "chai";
import { EscrowTimeLockVault } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("EscrowTimeLockVault", () => {
  let vault:        EscrowTimeLockVault;
  let owner:        HardhatEthersSigner;  // Person A
  let receiver:     HardhatEthersSigner;  // Person B
  let unauthorized: HardhatEthersSigner;  // Person C

  beforeEach(async () => {
    [owner, receiver, unauthorized] = await ethers.getSigners();
    // In Hardhat signers come pre-funded — no airdrop needed ever!

    const Factory = await ethers.getContractFactory("EscrowTimeLockVault");
    vault = await Factory.deploy();
    await vault.waitForDeployment();
  });

  // ─────────────────────────────────────────────
  // TEST 1: Initialize
  // ─────────────────────────────────────────────
  it("Person A initializes vault naming Person B with 5s lock", async () => {
    await vault.connect(owner).initialize(5, receiver.address);

    const state = await vault.getVault(owner.address);
    expect(state.owner).to.equal(owner.address);
    expect(state.receiver).to.equal(receiver.address);
    expect(state.isCancelled).to.equal(false);
    expect(state.totalDeposited).to.equal(0n);
  });

  // ─────────────────────────────────────────────
  // TEST 2: Owner cannot be receiver
  // ─────────────────────────────────────────────
  it("Fails if owner sets themselves as receiver", async () => {
    await expect(
      vault.connect(owner).initialize(5, owner.address)
    ).to.be.revertedWithCustomError(vault, "ReceiverCannotBeOwner");
  });

  // ─────────────────────────────────────────────
  // TEST 3: Deposit
  // ─────────────────────────────────────────────
  it("Person A deposits ETH into the vault", async () => {
    await vault.connect(owner).initialize(5, receiver.address);

    const depositAmount = ethers.parseEther("1.0");
    await vault.connect(owner).deposit({ value: depositAmount });

    const state = await vault.getVault(owner.address);
    expect(state.totalDeposited).to.equal(depositAmount);
  });

  // ─────────────────────────────────────────────
  // TEST 4: Person B cannot withdraw before lock
  // ─────────────────────────────────────────────
  it("Person B cannot withdraw before lock expires", async () => {
    await vault.connect(owner).initialize(5, receiver.address);
    await vault.connect(owner).deposit({ value: ethers.parseEther("1.0") });

    await expect(
      vault.connect(receiver).withdraw(owner.address)
    ).to.be.revertedWithCustomError(vault, "VaultStillLocked");
  });

  // ─────────────────────────────────────────────
  // TEST 5: Person A cannot withdraw
  // ─────────────────────────────────────────────
  it("Person A cannot withdraw — only Person B can", async () => {
    await vault.connect(owner).initialize(5, receiver.address);
    await vault.connect(owner).deposit({ value: ethers.parseEther("1.0") });

    await expect(
      vault.connect(owner).withdraw(owner.address)
    ).to.be.revertedWithCustomError(vault, "UnauthorizedReceiver");
  });

  // ─────────────────────────────────────────────
  // TEST 6: Unauthorized cannot withdraw
  // ─────────────────────────────────────────────
  it("Person C cannot withdraw", async () => {
    await vault.connect(owner).initialize(5, receiver.address);
    await vault.connect(owner).deposit({ value: ethers.parseEther("1.0") });

    await expect(
      vault.connect(unauthorized).withdraw(owner.address)
    ).to.be.revertedWithCustomError(vault, "UnauthorizedReceiver");
  });

  // ─────────────────────────────────────────────
  // TEST 7: Person B withdraws after lock expires
  // ─────────────────────────────────────────────
  it("Person B withdraws successfully after lock expires", async () => {
    await vault.connect(owner).initialize(5, receiver.address);
    const depositAmount = ethers.parseEther("1.0");
    await vault.connect(owner).deposit({ value: depositAmount });

    // Hardhat time helper — no need to actually wait!
    await time.increase(6);

    const receiverBalanceBefore = await ethers.provider.getBalance(receiver.address);
    await vault.connect(receiver).withdraw(owner.address);
    const receiverBalanceAfter = await ethers.provider.getBalance(receiver.address);

    expect(receiverBalanceAfter).to.be.greaterThan(receiverBalanceBefore);

    const state = await vault.getVault(owner.address);
    expect(state.totalDeposited).to.equal(0n);
  });

  // ─────────────────────────────────────────────
  // TEST 8: Person A cancels before lock
  // ─────────────────────────────────────────────
  it("Person A can cancel before lock expires", async () => {
    await vault.connect(owner).initialize(100, receiver.address);
    await vault.connect(owner).deposit({ value: ethers.parseEther("1.0") });

    await vault.connect(owner).cancel();

    const state = await vault.getVault(owner.address);
    expect(state.isCancelled).to.equal(true);
    expect(state.totalDeposited).to.equal(0n);
  });

  // ─────────────────────────────────────────────
  // TEST 9: Person A cannot cancel after lock
  // ─────────────────────────────────────────────
  it("Person A cannot cancel after lock expires", async () => {
    await vault.connect(owner).initialize(5, receiver.address);
    await vault.connect(owner).deposit({ value: ethers.parseEther("1.0") });

    await time.increase(6);

    await expect(
      vault.connect(owner).cancel()
    ).to.be.revertedWithCustomError(vault, "CannotCancelAfterUnlock");
  });
});