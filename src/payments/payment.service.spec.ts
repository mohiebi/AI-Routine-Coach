import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentNetwork, Prisma, StableTokenSymbol } from '@prisma/client';
import { CheckoutService } from '../checkout/checkout.service';
import { PremiumAccessService } from '../premium/premium-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoTransactionVerifier } from './crypto-transaction-verifier';
import { PaymentService } from './payment.service';

describe('PaymentService', () => {
  const checkout = (planCode: string) => ({
    id: 'checkout-1',
    userId: 'user-1',
    finalAmountUsd: new Prisma.Decimal('10.00'),
    plan: { code: planCode },
  });

  function makeService(planCode = 'PREMIUM_MONTHLY') {
    const prisma = {
      cryptoPayment: {
        create: jest.fn(async ({ data }) => ({
          id: 'payment-1',
          ...data,
          checkoutSession: { plan: { name: 'Premium Monthly' } },
        })),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      checkoutSession: {
        update: jest.fn(),
      },
    } as unknown as PrismaService;
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'PAYMENT_RECEIVER_ARBITRUM_ADDRESS') {
          return '0x1111111111111111111111111111111111111111';
        }
        if (key === 'PAYMENT_RECEIVER_ETHEREUM_ADDRESS') {
          return '0x2222222222222222222222222222222222222222';
        }
        if (key === 'PAYMENT_RECEIVER_BSC_ADDRESS') {
          return '0x3333333333333333333333333333333333333333';
        }
        if (key === 'PAYMENT_CHAIN_BSC_ENABLED') return 'false';
        return fallback;
      }),
    } as unknown as ConfigService;
    const checkoutService = {
      getUsableCheckout: jest.fn(async () => checkout(planCode)),
    } as unknown as CheckoutService;
    const premium = {} as PremiumAccessService;
    const verifier = {} as CryptoTransactionVerifier;

    return {
      prisma,
      service: new PaymentService(
        prisma,
        config,
        checkoutService,
        premium,
        verifier,
      ),
    };
  }

  it('accepts monthly Arbitrum payments', async () => {
    const { prisma, service } = makeService('PREMIUM_MONTHLY');

    await service.createCryptoPayment(
      'user-1',
      'checkout-1',
      StableTokenSymbol.USDT,
      PaymentNetwork.ARBITRUM,
    );

    expect((prisma as any).cryptoPayment.create).toHaveBeenCalled();
  });

  it('rejects monthly Ethereum payments', async () => {
    const { service } = makeService('PREMIUM_MONTHLY');

    await expect(
      service.createCryptoPayment(
        'user-1',
        'checkout-1',
        StableTokenSymbol.USDT,
        PaymentNetwork.ETHEREUM,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects BSC while disabled', async () => {
    const { service } = makeService('PREMIUM_YEARLY');

    await expect(
      service.createCryptoPayment(
        'user-1',
        'checkout-1',
        StableTokenSymbol.USDT,
        PaymentNetwork.BSC,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts yearly Ethereum payments', async () => {
    const { prisma, service } = makeService('PREMIUM_YEARLY');

    await service.createCryptoPayment(
      'user-1',
      'checkout-1',
      StableTokenSymbol.USDC,
      PaymentNetwork.ETHEREUM,
    );

    expect((prisma as any).cryptoPayment.create).toHaveBeenCalled();
  });
});
