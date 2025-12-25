import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Locked Compute Staking',
  projectId: '0ac6f8b15f0c4ab8b31c22e53ad58c5c',
  chains: [sepolia],
  ssr: false,
});
