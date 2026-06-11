import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentNetwork, StableTokenSymbol } from '@prisma/client';

export interface TokenConfig {
  symbol: StableTokenSymbol;
  contract: string;
  decimals: number;
}

export interface ChainConfig {
  chainId: number;
  name: PaymentNetwork;
  displayName: string;
  receiverEnv: string;
  enabledEnv: string;
  defaultEnabled: boolean;
  confirmations: number;
  tokens: Record<StableTokenSymbol, TokenConfig>;
}

export const PAYMENT_CHAINS: Record<PaymentNetwork, ChainConfig> = {
  ETHEREUM: {
    chainId: 1,
    name: 'ETHEREUM',
    displayName: 'Ethereum ERC20',
    receiverEnv: 'PAYMENT_RECEIVER_ETHEREUM_ADDRESS',
    enabledEnv: 'PAYMENT_CHAIN_ETHEREUM_ENABLED',
    defaultEnabled: true,
    confirmations: 12,
    tokens: {
      USDT: {
        symbol: 'USDT',
        contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6,
      },
      USDC: {
        symbol: 'USDC',
        contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
      },
    },
  },
  BSC: {
    chainId: 56,
    name: 'BSC',
    displayName: 'BNB Smart Chain',
    receiverEnv: 'PAYMENT_RECEIVER_BSC_ADDRESS',
    enabledEnv: 'PAYMENT_CHAIN_BSC_ENABLED',
    defaultEnabled: false,
    confirmations: 15,
    tokens: {
      USDT: {
        symbol: 'USDT',
        contract: '0x55d398326f99059fF775485246999027B3197955',
        decimals: 18,
      },
      USDC: {
        symbol: 'USDC',
        contract: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
        decimals: 18,
      },
    },
  },
  ARBITRUM: {
    chainId: 42161,
    name: 'ARBITRUM',
    displayName: 'Arbitrum One',
    receiverEnv: 'PAYMENT_RECEIVER_ARBITRUM_ADDRESS',
    enabledEnv: 'PAYMENT_CHAIN_ARBITRUM_ENABLED',
    defaultEnabled: true,
    confirmations: 20,
    tokens: {
      USDT: {
        symbol: 'USDT',
        contract: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        decimals: 6,
      },
      USDC: {
        symbol: 'USDC',
        contract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        decimals: 6,
      },
    },
  },
};

export const PLAN_NETWORKS: Record<string, PaymentNetwork[]> = {
  PREMIUM_MONTHLY: ['ARBITRUM'],
  PREMIUM_YEARLY: ['ARBITRUM', 'ETHEREUM'],
};

export const PLAN_TOKENS: Record<string, StableTokenSymbol[]> = {
  PREMIUM_MONTHLY: ['USDT', 'USDC'],
  PREMIUM_YEARLY: ['USDT', 'USDC'],
};

export function isEvmAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function normalizeAddress(value: string) {
  return value.trim().toLowerCase();
}

export function isChainEnabled(
  configService: ConfigService,
  network: PaymentNetwork,
) {
  const chain = PAYMENT_CHAINS[network];
  const raw = configService.get<string>(chain.enabledEnv);
  if (raw === undefined) {
    return chain.defaultEnabled;
  }
  return raw.trim().toLowerCase() !== 'false';
}

export function getReceiverAddress(
  configService: ConfigService,
  network: PaymentNetwork,
) {
  const chain = PAYMENT_CHAINS[network];
  const address = configService.get<string>(chain.receiverEnv);
  if (!address || !isEvmAddress(address)) {
    throw new BadRequestException(
      `${chain.receiverEnv} must be configured with a valid EVM address`,
    );
  }
  return address;
}
