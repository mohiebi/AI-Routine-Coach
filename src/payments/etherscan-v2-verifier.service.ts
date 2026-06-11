import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeAddress } from './payment-config';
import {
  CryptoTransactionVerifier,
  VerifyCryptoPaymentInput,
  VerifyCryptoPaymentResult,
} from './crypto-transaction-verifier';
import { rawTokenToDecimal } from './decimal-money';

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

interface EtherscanResponse<T> {
  status?: string;
  message?: string;
  result: T;
}

interface ReceiptLog {
  address: string;
  topics: string[];
  data: string;
}

interface ReceiptResult {
  status?: string;
  blockNumber?: string;
  logs?: ReceiptLog[];
}

@Injectable()
export class EtherscanV2VerifierService implements CryptoTransactionVerifier {
  private readonly baseUrl = 'https://api.etherscan.io/v2/api';

  constructor(private readonly configService: ConfigService) {}

  async verify(
    input: VerifyCryptoPaymentInput,
  ): Promise<VerifyCryptoPaymentResult> {
    if (!/^0x[a-fA-F0-9]{64}$/.test(input.txHash)) {
      return { verified: false, reason: 'Invalid transaction hash format' };
    }

    const [receipt, latestBlock] = await Promise.all([
      this.getReceipt(input.chainId, input.txHash),
      this.getLatestBlock(input.chainId),
    ]);

    if (!receipt) {
      return { verified: false, reason: 'Transaction was not found' };
    }

    if (receipt.status !== '0x1') {
      return { verified: false, reason: 'Transaction did not succeed' };
    }

    const blockNumber = receipt.blockNumber
      ? Number.parseInt(receipt.blockNumber, 16)
      : undefined;
    if (!blockNumber || Number.isNaN(blockNumber)) {
      return { verified: false, reason: 'Transaction block is unavailable' };
    }

    const confirmations = latestBlock - blockNumber + 1;
    if (confirmations < input.confirmations) {
      return {
        verified: false,
        reason: 'Transaction is not confirmed yet',
        blockNumber,
        confirmations,
      };
    }

    const tokenContract = normalizeAddress(input.tokenContract);
    const receiver = normalizeAddress(input.receiverAddress);
    const transfer = receipt.logs?.find((log) => {
      if (normalizeAddress(log.address) !== tokenContract) {
        return false;
      }
      if (log.topics?.[0]?.toLowerCase() !== TRANSFER_TOPIC) {
        return false;
      }
      return this.topicAddress(log.topics[2]) === receiver;
    });

    if (!transfer) {
      return {
        verified: false,
        reason: 'No matching token transfer to the receiver was found',
      };
    }

    const rawValue = BigInt(transfer.data).toString();
    const amount = rawTokenToDecimal(rawValue, input.tokenDecimals);
    if (amount.lessThan(input.expectedAmount)) {
      return { verified: false, reason: 'Transfer amount is below expected amount' };
    }

    return { verified: true, blockNumber, confirmations };
  }

  private async getReceipt(chainId: number, txHash: string) {
    const result = await this.request<ReceiptResult | null>({
      chainid: String(chainId),
      module: 'proxy',
      action: 'eth_getTransactionReceipt',
      txhash: txHash,
    });
    return result;
  }

  private async getLatestBlock(chainId: number) {
    const result = await this.request<string>({
      chainid: String(chainId),
      module: 'proxy',
      action: 'eth_blockNumber',
    });
    return Number.parseInt(result, 16);
  }

  private async request<T>(params: Record<string, string>): Promise<T> {
    const apiKey = this.configService.get<string>('ETHERSCAN_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('ETHERSCAN_API_KEY is not configured');
    }

    const url = new URL(this.baseUrl);
    Object.entries({ ...params, apikey: apiKey }).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );

    const response = await fetch(url);
    if (!response.ok) {
      throw new ServiceUnavailableException('Etherscan request failed');
    }

    const payload = (await response.json()) as EtherscanResponse<T>;
    if (typeof payload.result === 'string' && payload.result.startsWith('Error')) {
      throw new ServiceUnavailableException(payload.result);
    }

    return payload.result;
  }

  private topicAddress(topic?: string) {
    if (!topic || topic.length !== 66) {
      return undefined;
    }
    return `0x${topic.slice(26)}`.toLowerCase();
  }
}
