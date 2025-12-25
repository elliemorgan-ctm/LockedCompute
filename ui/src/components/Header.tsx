import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="header-content">
          <div className="header-left">
            <div className="logo-mark">⛓️</div>
            <div>
              <h1 className="header-title">Encrypted ETH Staking</h1>
              <p className="header-subtitle">Stake privately, unlock with verified decryption</p>
            </div>
          </div>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
