import { ethers, network } from "hardhat";

const VAULT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

async function main() {
  const [owner, receiver] = await ethers.getSigners();
  const vault = await ethers.getContractAt("EscrowTimeLockVault", VAULT_ADDRESS);

  // 1. Initialize with a 60s lock
  await (await vault.connect(owner).initialize(60, receiver.address)).wait();
  console.log("Initialized. Time remaining:", await vault.getTimeRemaining(owner.address));

  // 2. Deposit 1 ETH
  await (await vault.connect(owner).deposit({ value: ethers.parseEther("1") })).wait();
  console.log("Deposited:", (await vault.getVault(owner.address)).totalDeposited.toString(), "wei");

  // 3. Fast-forward the local chain's clock (only works on localhost/hardhat)
  await network.provider.send("evm_increaseTime", [61]);
  await network.provider.send("evm_mine");
  console.log("Time remaining after skip:", await vault.getTimeRemaining(owner.address));

  // 4. Receiver withdraws
  const before = await ethers.provider.getBalance(receiver.address);
  await (await vault.connect(receiver).withdraw(owner.address)).wait();
  const after = await ethers.provider.getBalance(receiver.address);
  console.log("Receiver gained (wei):", (after - before).toString());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});