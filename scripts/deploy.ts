import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Factory = await ethers.getContractFactory("EscrowTimeLockVault");
  const vault = await Factory.deploy();
  await vault.waitForDeployment();

  console.log("EscrowTimeLockVault deployed to:", await vault.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});