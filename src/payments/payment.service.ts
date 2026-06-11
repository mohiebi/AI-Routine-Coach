import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CheckoutStatus,
  CryptoPaymentStatus,
  PaymentNetwork,
  PremiumSource,
  Prisma,
  StableTokenSymbol,
} from '@prisma/client';
import { randomInt } from 'crypto';
import { CheckoutService } from '../checkout/checkout.service';
import { PremiumAccessService } from '../premium/premium-access.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CRYPTO_TRANSACTION_VERIFIER,
} from './crypto-transaction-verifier';
import type { CryptoTransactionVerifier } from './crypto-transaction-verifier';
import { tokenAmount } from './decimal-money';
import {
  getReceiverAddress,
  isChainEnabled,
  PAYMENT_CHAINS,
  PLAN_NETWORKS,
  PLAN_TOKENS,
} from './payment-config';

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly checkoutService: CheckoutService,
    private readonly premiumAccessService: PremiumAccessService,
    @Inject(CRYPTO_TRANSACTION_VERIFIER)
    private readonly verifier: CryptoTransactionVerifier,
  ) {}

  enabledNetworksForPlan(planCode: string) {
    return (PLAN_NETWORKS[planCode] ?? []).filter((network) =>
      isChainEnabled(this.configService, network),
    );
  }

  tokensForPlan(planCode: string) {
    return PLAN_TOKENS[planCode] ?? [];
  }

  async createCryptoPayment(
    userId: string,
    checkoutId: string,
    tokenSymbol: StableTokenSymbol,
    network: PaymentNetwork,
  ) {
    const checkout = await this.checkoutService.getUsableCheckout(checkoutId, userId);
    if (checkout.finalAmountUsd.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Checkout does not require payment');
    }

    this.validateTokenAndNetwork(checkout.plan.code, tokenSymbol, network);
    const chain = PAYMENT_CHAINS[network];
    const token = chain.tokens[tokenSymbol];
    const receiverAddress = getReceiverAddress(this.configService, network);
    const expectedAmount = this.uniqueExpectedAmount(checkout.finalAmountUsd);

    const payment = await this.prisma.cryptoPayment.create({
      data: {
        checkoutSessionId: checkout.id,
        network,
        chainId: chain.chainId,
        tokenSymbol,
        tokenContract: token.contract,
        receiverAddress,
        expectedAmount,
      },
      include: { checkoutSession: { include: { plan: true } } },
    });

    await this.prisma.checkoutSession.update({
      where: { id: checkout.id },
      data: { status: CheckoutStatus.AWAITING_PAYMENT },
    });

    return payment;
  }

  async submitTxHash(userId: string, paymentId: string, txHash: string) {
    const normalizedTxHash = txHash.toLowerCase();

    if (!/^0x[a-f0-9]{64}$/.test(normalizedTxHash)) {
      throw new BadRequestException('Invalid transaction hash format');
    }

    const payment = await this.getPayment(paymentId, userId);
    if (payment.status === CryptoPaymentStatus.VERIFIED) {
      throw new BadRequestException('Payment is already verified');
    }

    const duplicate = await this.prisma.cryptoPayment.findFirst({
      where: {
        txHash: normalizedTxHash,
        id: { not: payment.id },
        deletedAt: null,
      },
    });
    if (duplicate) {
      throw new BadRequestException('Transaction hash has already been used');
    }

    return this.prisma.cryptoPayment.update({
      where: { id: payment.id },
      data: {
        txHash: normalizedTxHash,
        status: CryptoPaymentStatus.SUBMITTED,
        submittedAt: new Date(),
        verificationError: null,
      },
      include: { checkoutSession: { include: { plan: true } } },
    });
  }

  async verifyPayment(userId: string, paymentId: string) {
    const payment = await this.getPayment(paymentId, userId);
    if (!payment.txHash) {
      throw new BadRequestException('Transaction hash has not been submitted');
    }
    if (payment.status === CryptoPaymentStatus.VERIFIED) {
      return payment;
    }
    if (payment.checkoutSession.expiresAt <= new Date()) {
      await this.prisma.cryptoPayment.update({
        where: { id: payment.id },
        data: {
          status: CryptoPaymentStatus.EXPIRED,
          verificationError: 'Checkout has expired',
        },
      });
      throw new BadRequestException('Checkout has expired');
    }

    // Atomically claim verification: only one concurrent call can transition
    // out of SUBMITTED/PENDING/REJECTED into VERIFYING. If another call already
    // claimed it (or completed it), return the current state instead of
    // re-verifying and potentially double-activating premium.
    const claim = await this.prisma.cryptoPayment.updateMany({
      where: {
        id: payment.id,
        status: {
          in: [
            CryptoPaymentStatus.PENDING,
            CryptoPaymentStatus.SUBMITTED,
            CryptoPaymentStatus.REJECTED,
          ],
        },
      },
      data: { status: CryptoPaymentStatus.VERIFYING },
    });
    if (claim.count === 0) {
      return this.getPayment(paymentId, userId);
    }

    const chain = PAYMENT_CHAINS[payment.network];
    const token = chain.tokens[payment.tokenSymbol];
    const result = await this.verifier.verify({
      txHash: payment.txHash,
      chainId: payment.chainId,
      tokenSymbol: payment.tokenSymbol,
      tokenContract: payment.tokenContract,
      expectedAmount: payment.expectedAmount,
      receiverAddress: payment.receiverAddress,
      confirmations: chain.confirmations,
      tokenDecimals: token.decimals,
    });

    if (!result.verified) {
      return this.prisma.cryptoPayment.update({
        where: { id: payment.id },
        data: {
          status: CryptoPaymentStatus.REJECTED,
          verificationError: result.reason ?? 'Payment could not be verified',
        },
        include: { checkoutSession: { include: { plan: true } } },
      });
    }

    const verifiedPayment = await this.prisma.cryptoPayment.update({
      where: { id: payment.id },
      data: {
        status: CryptoPaymentStatus.VERIFIED,
        verificationError: null,
        verifiedAt: new Date(),
      },
      include: { checkoutSession: { include: { plan: true } } },
    });

    await this.prisma.checkoutSession.update({
      where: { id: payment.checkoutSessionId },
      data: { status: CheckoutStatus.COMPLETED, completedAt: new Date() },
    });
    await this.premiumAccessService.activateFromCheckout(
      payment.checkoutSessionId,
      PremiumSource.CRYPTO_PAYMENT,
    );

    return verifiedPayment;
  }

  private validateTokenAndNetwork(
    planCode: string,
    tokenSymbol: StableTokenSymbol,
    network: PaymentNetwork,
  ) {
    if (!PLAN_TOKENS[planCode]?.includes(tokenSymbol)) {
      throw new BadRequestException('Token is not available for this plan');
    }
    if (!PLAN_NETWORKS[planCode]?.includes(network)) {
      throw new BadRequestException('Network is not available for this plan');
    }
    if (!isChainEnabled(this.configService, network)) {
      throw new BadRequestException('Network is currently disabled');
    }
  }

  private async getPayment(paymentId: string, userId?: string) {
    const payment = await this.prisma.cryptoPayment.findFirst({
      where: { id: paymentId, deletedAt: null },
      include: { checkoutSession: { include: { plan: true } } },
    });
    if (!payment || (userId && payment.checkoutSession.userId !== userId)) {
      throw new NotFoundException('Crypto payment not found');
    }
    return payment;
  }

  private uniqueExpectedAmount(amount: { toString(): string }) {
    const suffix = randomInt(1, 100);
    return tokenAmount(amount.toString()).add(new Prisma.Decimal(suffix).div(1000));
  }
}
