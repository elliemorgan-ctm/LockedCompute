import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const encryptedStaking = await deploy("EncryptedStaking", {
    from: deployer,
    log: true,
  });

  console.log(`EncryptedStaking contract: `, encryptedStaking.address);
};
export default func;
func.id = "deploy_encryptedStaking"; // id required to prevent reexecution
func.tags = ["EncryptedStaking"];
