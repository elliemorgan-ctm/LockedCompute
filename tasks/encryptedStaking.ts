import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

const getContract = async (hre: any, provided?: string) => {
  const { deployments, ethers } = hre;
  const deployment = provided ? { address: provided } : await deployments.get("EncryptedStaking");
  const contract = await ethers.getContractAt("EncryptedStaking", deployment.address);
  return { contract, address: deployment.address };
};

task("task:address", "Prints the EncryptedStaking address").setAction(async function (
  _taskArguments: TaskArguments,
  hre,
) {
  const { deployments } = hre;
  const deployment = await deployments.get("EncryptedStaking");
  console.log("EncryptedStaking address is " + deployment.address);
});

task("task:stake", "Stake ETH with a lock duration (seconds)")
  .addParam("amount", "Amount in ETH to stake")
  .addParam("duration", "Lock duration in seconds")
  .addOptionalParam("address", "Optionally specify the contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers } = hre;
    const amount = ethers.parseEther(taskArguments.amount);
    const duration = BigInt(taskArguments.duration);

    const [signer] = await ethers.getSigners();
    const { contract } = await getContract(hre, taskArguments.address);
    console.log(
      `Staking ${taskArguments.amount} ETH for ${duration.toString()} seconds from ${signer.address}...`,
    );

    const tx = await contract.connect(signer).stake(duration, { value: amount });
    const receipt = await tx.wait();
    console.log(`Stake tx: ${tx.hash} status=${receipt?.status}`);
  });

task("task:my-stake", "Decrypt and display the caller's stake")
  .addOptionalParam("address", "Optionally specify the contract address")
  .setAction(async function (_taskArguments: TaskArguments, hre) {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const [signer] = await ethers.getSigners();
    const { contract, address } = await getContract(hre, _taskArguments.address);

    const encryptedStake = await contract.getEncryptedStake(signer.address);
    if (encryptedStake === ethers.ZeroHash) {
      console.log("No active stake");
      return;
    }

    const clearStake = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedStake,
      address,
      signer,
    );
    const unlock = await contract.getUnlockTime(signer.address);

    console.log(`Encrypted handle: ${encryptedStake}`);
    console.log(`Amount (wei)  : ${clearStake.toString()}`);
    console.log(`Unlock time   : ${unlock.toString()}`);
  });

task("task:request-withdrawal", "Request a withdrawal for the caller")
  .addOptionalParam("address", "Optionally specify the contract address")
  .setAction(async function (_taskArguments: TaskArguments, hre) {
    const { ethers } = hre;
    const [signer] = await ethers.getSigners();
    const { contract } = await getContract(hre, _taskArguments.address);

    const tx = await contract.connect(signer).requestWithdrawal();
    const receipt = await tx.wait();
    console.log(`Request withdrawal tx: ${tx.hash} status=${receipt?.status}`);
  });

task("task:finalize-withdrawal", "Finalize a pending withdrawal by fetching a public decryption proof")
  .addOptionalParam("address", "Optionally specify the contract address")
  .setAction(async function (_taskArguments: TaskArguments, hre) {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const [signer] = await ethers.getSigners();
    const { contract, address } = await getContract(hre, _taskArguments.address);

    const encryptedStake = await contract.getEncryptedStake(signer.address);
    if (encryptedStake === ethers.ZeroHash) {
      throw new Error("No active stake found for caller");
    }

    console.log(`Requesting public decrypt for handle ${encryptedStake}...`);
    const publicDecrypt = await fhevm.publicDecrypt([encryptedStake]);
    const clearAmount =
      publicDecrypt.clearValues[encryptedStake] ??
      publicDecrypt.clearValues[ethers.hexlify(encryptedStake)];
    if (clearAmount === undefined) {
      throw new Error("Failed to obtain clear amount from public decrypt");
    }

    const tx = await contract
      .connect(signer)
      .finalizeWithdrawal(encryptedStake, BigInt(clearAmount), publicDecrypt.decryptionProof);
    const receipt = await tx.wait();
    console.log(`Finalize withdrawal tx: ${tx.hash} status=${receipt?.status}`);
  });
