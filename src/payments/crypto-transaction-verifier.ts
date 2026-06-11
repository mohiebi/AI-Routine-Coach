import { Prisma, StableTokenSymbol } from '@prisma/client';

export interface VerifyCryptoPaymentInput {
  txHash: string;
  chainId: number;
  tokenSymbol: StableTokenSymbol;
  tokenContract: string;
  expectedAmount: Prisma.Decimal;
  receiverAddress: string;
  confirmations: number;
  tokenDecimals: number;
}

export interface VerifyCryptoPaymentResult {
  verified: boolean;
  reason?: string;
  blockNumber?: number;
  confirmations?: number;
}

export interface CryptoTransactionVerifier {
  verify(input: VerifyCryptoPaymentInput): Promise<VerifyCryptoPaymentResult>;
}

export const CRYPTO_TRANSACTION_VERIFIER = Symbol(
  'CRYPTO_TRANSACTION_VERIFIER',
);
