import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { EncryptedStaking, EncryptedStaking__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("EncryptedStaking")) as EncryptedStaking__factory;
  const contract = (await factory.deploy()) as EncryptedStaking;
  const address = await contract.getAddress();

  return { contract, address };
}

describe("EncryptedStaking", function () {
  let signers: Signers;
  let contract: EncryptedStaking;
  let contractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("Tests require the FHEVM mock environment.");
      this.skip();
    }

    ({ contract, address: contractAddress } = await deployFixture());
  });

  it("stores an encrypted stake and allows user decryption", async function () {
    const amount = ethers.parseEther("1");
    const duration = 7 * 24 * 60 * 60;

    await expect(contract.connect(signers.alice).stake(duration, { value: amount })).to.emit(
      contract,
      "Staked",
    );

    const encryptedStake = await contract.getEncryptedStake(signers.alice.address);
    expect(encryptedStake).to.not.equal(ethers.ZeroHash);

    const decrypted = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedStake,
      contractAddress,
      signers.alice,
    );
    expect(decrypted).to.equal(amount);

    const unlockTime = await contract.getUnlockTime(signers.alice.address);
    expect(unlockTime).to.be.greaterThan(0n);
  });

  it("prevents withdrawal before the lock expires", async function () {
    const amount = ethers.parseEther("0.2");
    const duration = 3600;

    await contract.connect(signers.alice).stake(duration, { value: amount });
    await expect(contract.connect(signers.alice).requestWithdrawal()).to.be.revertedWith(
      "Stake still locked",
    );
  });

  it("finalizes a withdrawal after producing a public decryption proof", async function () {
    const amount = ethers.parseEther("0.5");
    const duration = 2;
    const alice = signers.alice;

    await contract.connect(alice).stake(duration, { value: amount });

    await ethers.provider.send("evm_increaseTime", [duration + 1]);
    await ethers.provider.send("evm_mine", []);

    await contract.connect(alice).requestWithdrawal();

    const encryptedStake = await contract.getEncryptedStake(alice.address);
    const publicDecrypt = await fhevm.publicDecrypt([encryptedStake]);
    const clearAmount =
      publicDecrypt.clearValues[encryptedStake] ??
      publicDecrypt.clearValues[ethers.hexlify(encryptedStake)];
    expect(clearAmount).to.exist;

    const balanceBefore = await ethers.provider.getBalance(alice.address);

    const tx = await contract
      .connect(alice)
      .finalizeWithdrawal(encryptedStake, BigInt(clearAmount!), publicDecrypt.decryptionProof);
    const receipt = await tx.wait();
    expect(receipt?.status).to.equal(1n);

    const balanceAfter = await ethers.provider.getBalance(alice.address);
    expect(balanceAfter).to.be.greaterThan(balanceBefore);
    const state = await contract.hasStake(alice.address);
    expect(state).to.equal(false);
  });
});
