# LockedCompute

LockedCompute is an Ethereum time-lock staking dapp that keeps stake amounts private using Fully Homomorphic Encryption
(FHE). Users lock ETH for a chosen duration, the amount is stored on chain as an encrypted value, and withdrawals are
finalized only after the lock expires and a Zama FHEVM decryption proof is provided.

## Project Summary

- Goal: privacy-preserving ETH time locks with on-chain enforcement.
- Core idea: encrypt the stake amount on chain, decrypt only at withdrawal time.
- Target network: Sepolia for public deployments, local FHEVM node for development/testing.
- Trust model: no off-chain custodian for funds; only the FHEVM KMS provides decryption proofs.

## Problem This Solves

1. Standard staking/time-lock vaults expose deposited amounts, which can leak user financial information.
2. Private stake amounts are difficult to enforce on chain without trusted off-chain components.
3. Time locks require strict, verifiable enforcement and a clean withdrawal path after unlock.

LockedCompute addresses these by storing the amount as an encrypted value, enforcing unlock time in the smart contract,
and using the FHEVM decryption proof flow to finalize withdrawals.

## Advantages

- Amount privacy: the staked value is encrypted on chain using FHE.
- Trust minimized: the contract only releases ETH after a verified FHEVM decryption proof.
- Simple user flow: stake, wait, request withdrawal, finalize with proof.
- Deterministic unlock: enforced by block timestamps on chain.
- Clear auditability: events emit encrypted handles and unlock timestamps without revealing the amount.

## Key Features

- Encrypted ETH staking with a user-defined lock duration.
- One active stake per address at a time.
- Two-step withdrawal: request after unlock, then finalize with proof.
- On-chain decryption verification using Zama FHEVM signatures.
- Read-only contract methods that take explicit addresses (no implicit msg.sender).
- UI read path with viem and write path with ethers.

## How It Works

1. Stake
   - The user calls `stake(lockDuration)` and sends ETH.
   - The contract encrypts the amount (euint64) and stores it.
   - Unlock time is set to `block.timestamp + lockDuration`.
2. Request withdrawal
   - After the unlock time, the user calls `requestWithdrawal()`.
   - The encrypted amount is marked as publicly decryptable.
   - A handle is stored to prevent duplicate requests.
3. Finalize withdrawal
   - A decryption proof is produced by the FHEVM KMS.
   - The user (or relayer) calls `finalizeWithdrawal(...)`.
   - The contract verifies the proof and transfers ETH to the staker.

## Contract Behavior and Constraints

- Stake amount must be greater than zero and fit into uint64.
- Only one active stake per address is allowed.
- Withdrawals are blocked until the unlock time passes.
- Finalize step requires a valid decryption proof and a matching handle.
- No rewards are accrued; this is a privacy-preserving time lock, not a yield product.
- Amounts are stored as encrypted values; only the contract and the user are allowed to access the ciphertext.

## Architecture

On-chain:
- `EncryptedStaking` contract in `contracts/`.
- Stores encrypted stake amounts, lock time, and withdrawal state.
- Verifies FHEVM decryption proofs before releasing ETH.

Off-chain:
- FHEVM KMS provides public decryption proofs when requested.
- A relayer or the UI can submit the proof to finalize withdrawal.

Frontend (ui):
- React + Vite app that connects to Sepolia.
- Reads contract state with viem.
- Sends transactions with ethers.
- No local storage usage and no environment variables.

## Tech Stack

- Smart contracts: Solidity 0.8.24
- FHE: Zama FHEVM (FHE.sol, KMS decryption proofs)
- Framework: Hardhat + TypeScript
- Frontend: React + Vite + TypeScript
- Web3: viem (reads), ethers (writes), RainbowKit (wallet UX)
- Package manager: npm

## Repository Structure

```
/
├── contracts/          # Solidity contracts
├── deploy/             # Deployment scripts
├── deployments/        # Deployment artifacts (ABI source of truth)
├── tasks/              # Hardhat tasks
├── test/               # Hardhat tests
├── ui/                 # Frontend app (React + Vite)
└── docs/               # Zama-related references
```

## Prerequisites

- Node.js 20+
- npm
- An Ethereum wallet private key for deployment (stored in `.env`)
- An Infura API key for Sepolia access (stored in `.env`)

## Configuration

The Hardhat setup loads environment values using dotenv. The following values are required:

- `PRIVATE_KEY` for deployment
- `INFURA_API_KEY` for Sepolia RPC access

Note: The frontend does not use environment variables and is configured in code.

## Development Workflow

1. Install dependencies

   ```bash
   npm install
   ```

2. Compile contracts

   ```bash
   npm run compile
   ```

3. Run tasks and tests (required before public deployment)

   ```bash
   npm run test
   ```

4. Deploy to a local FHEVM-ready node (for development)

   ```bash
   npx hardhat node
   npx hardhat deploy --network localhost
   ```

5. Deploy to Sepolia (after tasks and tests pass)

   ```bash
   npx hardhat deploy --network sepolia
   ```

6. Optional verification

   ```bash
   npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
   ```

## Frontend Usage

All UI work lives under `ui/` and does not import files from the repository root.

1. Install UI dependencies

   ```bash
   cd ui
   npm install
   ```

2. Run the dev server

   ```bash
   npm run dev
   ```

3. Build the production bundle

   ```bash
   npm run build
   ```

UI constraints and integration notes:

- The UI connects to Sepolia only (no localhost chain).
- The ABI must be copied from `deployments/sepolia/` into a TypeScript module in the UI.
- Contract reads use viem and contract writes use ethers.
- No browser storage is used (no localStorage or sessionStorage).
- No environment variables are used in the UI.

## Testing

- Tests run with the FHEVM mock environment.
- Coverage focuses on encryption storage, lock enforcement, and public decryption flow.

Run:

```bash
npm run test
```

## Security and Privacy Notes

- Encryption: stake amounts are stored as FHE encrypted values (euint64).
- Decryption: only possible after the user requests withdrawal and the KMS produces a proof.
- Proof verification: the contract verifies FHEVM signatures before transferring ETH.
- Timing: unlock times depend on block timestamps and are enforced on chain.
- Risk: decryption proof availability and relayer latency can delay finalization.

## Future Plans

- Multiple concurrent stakes per address.
- Partial withdrawals and restaking.
- Deeper UI feedback during the decryption proof lifecycle.
- Automated proof relaying and retry handling.
- Expanded test coverage for edge cases and failure modes.
- Support for additional networks compatible with FHEVM.
- Formal security review and gas optimizations.

## License

This project is licensed under the BSD-3-Clause-Clear License. See `LICENSE` for details.
