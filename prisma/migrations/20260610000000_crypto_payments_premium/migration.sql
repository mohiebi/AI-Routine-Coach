-- Clean replacement of legacy coupon/direct-subscription premium access.
DROP TABLE IF EXISTS "CouponRedemption";
DROP TABLE IF EXISTS "UserSubscription";
DROP TABLE IF EXISTS "Coupon";
DROP TYPE IF EXISTS "SubscriptionStatus";
DROP TYPE IF EXISTS "SubscriptionPlan";

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('PENDING', 'AWAITING_PAYMENT', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentNetwork" AS ENUM ('ETHEREUM', 'BSC', 'ARBITRUM');

-- CreateEnum
CREATE TYPE "StableTokenSymbol" AS ENUM ('USDT', 'USDC');

-- CreateEnum
CREATE TYPE "CryptoPaymentStatus" AS ENUM ('PENDING', 'SUBMITTED', 'VERIFYING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PremiumSource" AS ENUM ('COUPON_100', 'CRYPTO_PAYMENT', 'ADMIN_GRANT');

-- CreateEnum
CREATE TYPE "PremiumEntitlementStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceUsd" DECIMAL(12,2) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "couponId" UUID,
    "originalAmountUsd" DECIMAL(12,2) NOT NULL,
    "discountAmountUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "finalAmountUsd" DECIMAL(12,2) NOT NULL,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CheckoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoPayment" (
    "id" UUID NOT NULL,
    "checkoutSessionId" UUID NOT NULL,
    "network" "PaymentNetwork" NOT NULL,
    "chainId" INTEGER NOT NULL,
    "tokenSymbol" "StableTokenSymbol" NOT NULL,
    "tokenContract" TEXT NOT NULL,
    "receiverAddress" TEXT NOT NULL,
    "expectedAmount" DECIMAL(18,6) NOT NULL,
    "txHash" TEXT,
    "status" "CryptoPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "verificationError" TEXT,
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CryptoPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PremiumEntitlement" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "checkoutSessionId" UUID,
    "source" "PremiumSource" NOT NULL,
    "sourceId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "PremiumEntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PremiumEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_isActive_deletedAt_idx" ON "SubscriptionPlan"("isActive", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_isActive_expiresAt_idx" ON "Coupon"("isActive", "expiresAt");

-- CreateIndex
CREATE INDEX "Coupon_deletedAt_idx" ON "Coupon"("deletedAt");

-- CreateIndex
CREATE INDEX "CheckoutSession_userId_status_expiresAt_idx" ON "CheckoutSession"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "CheckoutSession_planId_idx" ON "CheckoutSession"("planId");

-- CreateIndex
CREATE INDEX "CheckoutSession_couponId_idx" ON "CheckoutSession"("couponId");

-- CreateIndex
CREATE INDEX "CheckoutSession_deletedAt_idx" ON "CheckoutSession"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoPayment_txHash_key" ON "CryptoPayment"("txHash");

-- CreateIndex
CREATE INDEX "CryptoPayment_checkoutSessionId_idx" ON "CryptoPayment"("checkoutSessionId");

-- CreateIndex
CREATE INDEX "CryptoPayment_network_status_idx" ON "CryptoPayment"("network", "status");

-- CreateIndex
CREATE INDEX "CryptoPayment_deletedAt_idx" ON "CryptoPayment"("deletedAt");

-- CreateIndex
CREATE INDEX "PremiumEntitlement_userId_status_expiresAt_idx" ON "PremiumEntitlement"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "PremiumEntitlement_checkoutSessionId_idx" ON "PremiumEntitlement"("checkoutSessionId");

-- CreateIndex
CREATE INDEX "PremiumEntitlement_deletedAt_idx" ON "PremiumEntitlement"("deletedAt");

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoPayment" ADD CONSTRAINT "CryptoPayment_checkoutSessionId_fkey" FOREIGN KEY ("checkoutSessionId") REFERENCES "CheckoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumEntitlement" ADD CONSTRAINT "PremiumEntitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumEntitlement" ADD CONSTRAINT "PremiumEntitlement_checkoutSessionId_fkey" FOREIGN KEY ("checkoutSessionId") REFERENCES "CheckoutSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
