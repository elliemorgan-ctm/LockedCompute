import { useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Contract, formatEther, parseEther } from 'ethers';
import { Header } from './Header';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import '../styles/StakingApp.css';

type AsyncState = 'stake' | 'decrypt' | 'request' | 'finalize' | null;

export function StakingApp() {
  const { address } = useAccount();
  const signer = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [amount, setAmount] = useState('0.25');
  const [lockDays, setLockDays] = useState(7);
  const [decryptedAmount, setDecryptedAmount] = useState<string | null>(null);
  const [publicAmount, setPublicAmount] = useState<string | null>(null);
  const [asyncState, setAsyncState] = useState<AsyncState>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const contractReady =true

  const contractAddress = contractReady ? (CONTRACT_ADDRESS as `0x${string}`) : undefined;

  const { data: encryptedStake, refetch: refetchStake } = useReadContract({
    address: contractAddress,
    abi: CONTRACT_ABI,
    functionName: 'getEncryptedStake',
    args: address && contractReady ? [address] : undefined,
    query: { enabled: !!address && contractReady },
  });

  const { data: unlockTime, refetch: refetchUnlock } = useReadContract({
    address: contractAddress,
    abi: CONTRACT_ABI,
    functionName: 'getUnlockTime',
    args: address && contractReady ? [address] : undefined,
    query: { enabled: !!address && contractReady },
  });

  // const { data: hasStake } = useReadContract({
  //   address: contractAddress,
  //   abi: CONTRACT_ABI,
  //   functionName: 'hasStake',
  //   args: address && contractReady ? [address] : undefined,
  //   query: { enabled: !!address && contractReady },
  // });

  const { data: pendingHandle, refetch: refetchPending } = useReadContract({
    address: contractAddress,
    abi: CONTRACT_ABI,
    functionName: 'getPendingHandle',
    args: address && contractReady ? [address] : undefined,
    query: { enabled: !!address && contractReady },
  });

  const { data: ready } = useReadContract({
    address: contractAddress,
    abi: CONTRACT_ABI,
    functionName: 'isReadyForWithdrawal',
    args: address && contractReady ? [address] : undefined,
    query: { enabled: !!address && contractReady },
  });

  const unlockDate = useMemo(() => {
    if (!unlockTime) return null;
    const ts = Number(unlockTime);
    if (!Number.isFinite(ts) || ts === 0) return null;
    return new Date(ts * 1000);
  }, [unlockTime]);

  const readyToWithdraw = Boolean(ready);
  const encryptedHandle = encryptedStake as string | undefined;
  const requestedHandle = pendingHandle as string | undefined;

  const resetUi = () => {
    setStatus(null);
    setTxHash(null);
    setAsyncState(null);
    setPublicAmount(null);
    setDecryptedAmount(null);
  };

  const withContract = async () => {
    const resolvedSigner = await signer;
    if (!resolvedSigner) {
      throw new Error('Connect your wallet to continue');
    }
    if (!contractReady) {
      throw new Error('Contract address is not configured');
    }
    return new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, resolvedSigner);
  };

  const onStake = async (e: React.FormEvent) => {
    e.preventDefault();
    resetUi();
    try {
      const weiAmount = parseEther(amount);
      const durationSeconds = BigInt(lockDays) * BigInt(24 * 60 * 60);

      setAsyncState('stake');
      setStatus('Awaiting wallet confirmation...');
      const contract = await withContract();
      const tx = await contract.stake(durationSeconds, { value: weiAmount });
      setTxHash(tx.hash);
      setStatus('Submitting stake...');
      await tx.wait();

      setStatus('Stake confirmed');
      await Promise.all([refetchStake(), refetchUnlock(), refetchPending()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stake';
      setStatus(message);
    } finally {
      setAsyncState(null);
    }
  };

  const decryptMyStake = async () => {
    if (!encryptedHandle || !address) {
      setStatus('No encrypted stake to decrypt');
      return;
    }
    resetUi();
    if (!instance) {
      setStatus('Encryption service is not ready yet');
      return;
    }
    try {
      setAsyncState('decrypt');
      setStatus('Generating signed request...');

      const keypair = instance.generateKeypair();
      const handleContractPairs = [
        {
          handle: encryptedHandle,
          contractAddress: CONTRACT_ADDRESS,
        },
      ];
      const startTimestamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const eip712 = instance.createEIP712(
        keypair.publicKey,
        [CONTRACT_ADDRESS],
        startTimestamp,
        durationDays,
      );

      const resolvedSigner = await signer;
      if (!resolvedSigner) {
        throw new Error('Wallet signer missing');
      }

      const signature = await resolvedSigner.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        [CONTRACT_ADDRESS],
        address,
        startTimestamp,
        durationDays,
      );

      const clearValue = result[encryptedHandle] ?? result[encryptedHandle.toLowerCase()];
      if (!clearValue) {
        throw new Error('Failed to decrypt stake amount');
      }

      setDecryptedAmount(formatEther(BigInt(clearValue)));
      setStatus('Decrypted with your keypair');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to decrypt right now';
      setStatus(message);
    } finally {
      setAsyncState(null);
    }
  };

  const requestWithdrawal = async () => {
    resetUi();
    try {
      setAsyncState('request');
      setStatus('Submitting withdrawal request...');
      const contract = await withContract();
      const tx = await contract.requestWithdrawal();
      setTxHash(tx.hash);
      await tx.wait();
      setStatus('Public decryption opened. You can now finalize.');
      await Promise.all([refetchPending(), refetchUnlock(), refetchStake()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to request withdrawal';
      setStatus(message);
    } finally {
      setAsyncState(null);
    }
  };

  const finalizeWithdrawal = async () => {
    resetUi();
    if (!encryptedHandle) {
      setStatus('No encrypted stake found');
      return;
    }
    if (!instance) {
      setStatus('Encryption service is not ready yet');
      return;
    }
    try {
      setAsyncState('finalize');
      setStatus('Fetching public decryption proof...');

      const publicDecrypt = await instance.publicDecrypt([encryptedHandle]);
      const clearAmount =
        publicDecrypt.clearValues[encryptedHandle] ??
        publicDecrypt.clearValues[encryptedHandle.toLowerCase()];
      if (!clearAmount) {
        throw new Error('Could not read decrypted amount');
      }

      setPublicAmount(formatEther(BigInt(clearAmount)));

      const contract = await withContract();
      const tx = await contract.finalizeWithdrawal(
        encryptedHandle,
        BigInt(clearAmount),
        publicDecrypt.decryptionProof,
      );
      setTxHash(tx.hash);
      setStatus('Finalizing withdrawal...');
      await tx.wait();

      setStatus('Withdrawal completed');
      await Promise.all([refetchPending(), refetchStake(), refetchUnlock()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to finalize withdrawal';
      setStatus(message);
    } finally {
      setAsyncState(null);
    }
  };

  const unlockCountdown = useMemo(() => {
    if (!unlockDate) return null;
    const now = Date.now();
    const diff = unlockDate.getTime() - now;
    if (diff <= 0) return 'Ready to withdraw';
    const hours = Math.max(0, Math.floor(diff / (1000 * 60 * 60)));
    const minutes = Math.max(0, Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)));
    return `${hours}h ${minutes}m remaining`;
  }, [unlockDate]);

  return (
    <div className="app-shell">
      <Header />
      <main className="staking-main">
        {!contractReady && (
          <div className="banner warning">
            <div>
              <p className="banner-title">Contract address missing</p>
              <p className="banner-text">
                Add the deployed EncryptedStaking address from <code>deployments/sepolia</code> to
                enable interactions.
              </p>
            </div>
          </div>
        )}
        {zamaError && (
          <div className="banner error">
            <div>
              <p className="banner-title">Zama relayer unavailable</p>
              <p className="banner-text">{zamaError}</p>
            </div>
          </div>
        )}

        <div className="grid two-column">
          <section className="card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Stake privately</p>
                <h2>Lock ETH with encrypted accounting</h2>
              </div>
              <span className="pill muted">ETH</span>
            </div>

            <form className="stack" onSubmit={onStake}>
              <label className="field">
                <span>Amount (ETH)</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  disabled={!contractReady || asyncState === 'stake'}
                />
              </label>

              <label className="field">
                <span>Lock duration (days)</span>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={lockDays}
                  onChange={(e) => setLockDays(Number(e.target.value))}
                  required
                  disabled={!contractReady || asyncState === 'stake'}
                />
              </label>

              <button
                type="submit"
                className="primary"
                disabled={!contractReady || !address || asyncState === 'stake'}
              >
                {asyncState === 'stake' ? 'Submitting...' : 'Stake with encryption'}
              </button>
            </form>

            <div className="muted-text">
              Funds are recorded as encrypted values with ACLs set for you and the contract. Unlock
              is permitted after the selected duration.
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Your position</p>
                <h2>Encrypted balance overview</h2>
              </div>
              <span className={`pill ${readyToWithdraw ? 'success' : 'muted'}`}>
                {readyToWithdraw ? 'Ready' : 'Locked'}
              </span>
            </div>

            <div className="status-grid">
              <div>
                <p className="label">Encrypted handle</p>
                <p className="value mono">
                  {encryptedHandle ? `${encryptedHandle.slice(0, 10)}...` : 'None'}
                </p>
              </div>
              <div>
                <p className="label">Unlock time</p>
                <p className="value">
                  {unlockDate ? unlockDate.toLocaleString() : 'Not set'}
                  {unlockCountdown ? <span className="hint"> · {unlockCountdown}</span> : null}
                </p>
              </div>
              <div>
                <p className="label">Pending withdrawal</p>
                <p className="value">
                  {requestedHandle ? `${requestedHandle.slice(0, 10)}...` : 'No request'}
                </p>
              </div>
            </div>

            <div className="actions">
              <button
                className="ghost"
                onClick={decryptMyStake}
                disabled={
                  !encryptedHandle || !contractReady || asyncState === 'decrypt' || zamaLoading
                }
              >
                {asyncState === 'decrypt' ? 'Decrypting...' : 'Decrypt with my key'}
              </button>
              <button
                className="secondary"
                onClick={requestWithdrawal}
                disabled={!readyToWithdraw || asyncState === 'request'}
              >
                {asyncState === 'request' ? 'Requesting...' : 'Request withdrawal'}
              </button>
              <button
                className="primary"
                onClick={finalizeWithdrawal}
                disabled={!requestedHandle || asyncState === 'finalize'}
              >
                {asyncState === 'finalize' ? 'Finalizing...' : 'Finalize with proof'}
              </button>
            </div>

            <div className="result-stack">
              {decryptedAmount && (
                <div className="pill success">
                  Your encrypted stake equals <strong>{decryptedAmount} ETH</strong>
                </div>
              )}
              {publicAmount && (
                <div className="pill info">
                  Public decryption: <strong>{publicAmount} ETH</strong>
                </div>
              )}
              {txHash && (
                <div className="mono small">
                  Last tx: <span className="linkish">{txHash}</span>
                </div>
              )}
            </div>
          </section>
        </div>

        {status && (
          <div className="banner neutral">
            <p className="banner-title">Status</p>
            <p className="banner-text">{status}</p>
          </div>
        )}
      </main>
    </div>
  );
}
