import { Injectable } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import {
  CheckoutSession,
  Coupon,
  CryptoPayment,
  PaymentNetwork,
  PremiumSource,
  StableTokenSymbol,
  SubscriptionPlan,
} from '@prisma/client';
import { Context, Markup, Telegraf } from 'telegraf';
import { CheckoutService } from '../../checkout/checkout.service';
import { CouponGeneratorService } from '../../coupons/coupon-generator.service';
import { formatToken, formatUsd } from '../../payments/decimal-money';
import { PAYMENT_CHAINS } from '../../payments/payment-config';
import { PaymentService } from '../../payments/payment.service';
import { LoyaltyStatus, PremiumAccessService } from '../../premium/premium-access.service';
import { CANCEL_ROW, MAIN_KEYBOARD, MENU_ROW } from '../telegram.constants';
import { TelegramConversationService } from '../telegram-conversation.service';
import { TelegramFormattersService } from '../telegram-formatters.service';
import { TelegramHelperService } from '../telegram-helper.service';
import { ConversationState } from '../telegram.types';

@Injectable()
export class PremiumHandler {
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly paymentService: PaymentService,
    private readonly premiumAccessService: PremiumAccessService,
    private readonly couponGeneratorService: CouponGeneratorService,
    private readonly helper: TelegramHelperService,
    private readonly conversations: TelegramConversationService,
    private readonly formatters: TelegramFormattersService,
  ) {}

  register(bot: Telegraf<Context>): void {
    bot.hears('⭐ Premium', (ctx) => this.handlePremium(ctx));
    bot.command('premium', (ctx) => this.handlePremium(ctx));

    bot.action('premium_info', (ctx) => this.handlePremium(ctx));
    bot.action(/^premium:plan:(.+)$/, (ctx) => this.handlePremiumPlan(ctx));
    bot.action(/^premium:renew:(.+)$/, (ctx) => this.handleLoyaltyRenew(ctx));
    bot.action(/^checkout:pay:(.+)$/, (ctx) => this.handleCheckoutPay(ctx));
    bot.action(/^checkout:coupon:(.+)$/, (ctx) => this.startCouponEntry(ctx));
    bot.action(/^checkout:cancel:(.+)$/, (ctx) => this.handleCheckoutCancel(ctx));
    bot.action(/^checkout:remove_coupon:(.+)$/, (ctx) => this.handleCheckoutRemoveCoupon(ctx));
    bot.action(/^payment:token:([^:]+):(.+)$/, (ctx) => this.handlePaymentToken(ctx));
    bot.action(/^paynet:([^:]+):([^:]+):(.+)$/, (ctx) => this.handlePaymentNetwork(ctx));
    bot.action(/^payment:verify:(.+)$/, (ctx) => this.handlePaymentVerifyRetry(ctx));
    bot.action(/^payment:resubmit:(.+)$/, (ctx) => this.handlePaymentResubmit(ctx));
  }

  async handlePremium(ctx: Context): Promise<void> {
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    const entitlement = await this.premiumAccessService.getActiveEntitlement(user.id);
    const plans = await this.checkoutService.listPlans();
    const planButtons = [
      ...plans.map((plan) => [
        Markup.button.callback(
          `${plan.name} — ${formatUsd(plan.priceUsd)}`,
          `premium:plan:${plan.code}`,
        ),
      ]),
      [Markup.button.callback('Back', 'cancel')],
    ];

    if (entitlement && entitlement.source === PremiumSource.TRIAL) {
      const trialCoupon = await this.couponGeneratorService.getOrCreateTrialEndingCoupon(user.id);
      await ctx.reply(
        this.formatters.premiumTrialPitch(plans, entitlement.expiresAt, trialCoupon.code),
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard(planButtons) },
      );
      return;
    }

    if (entitlement) {
      const loyaltyCoupon = await this.couponGeneratorService.getOrCreateLoyaltyCoupon(user.id);
      await ctx.reply(
        this.formatters.premiumActive(entitlement.expiresAt, loyaltyCoupon.code),
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('💬 AI Coach', 'ai:coach'),
              Markup.button.callback('📊 AI Insights', 'ai:insights'),
            ],
            [Markup.button.callback('🔧 AI Optimise Routines', 'ai:optimize')],
            [Markup.button.callback('🔄 Renew with 30% off', `premium:renew:${plans[0]?.code ?? ''}`)],
          ]),
        },
      );
      return;
    }

    const loyaltyStatus: LoyaltyStatus = await this.premiumAccessService.getLoyaltyStatus(user.id);
    let loyaltyCouponCode: string | undefined;
    if (loyaltyStatus === 'returning') {
      const coupon = await this.couponGeneratorService.getOrCreateLoyaltyCoupon(user.id);
      loyaltyCouponCode = coupon.code;
    }

    await ctx.reply(this.formatters.premiumPitch(plans, loyaltyCouponCode), {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(planButtons),
    });
  }

  private async handlePremiumPlan(ctx: Context): Promise<void> {
    const planCode = this.helper.matchId(ctx);
    if (!planCode) return;
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    try {
      const checkout = await this.checkoutService.createCheckout(user.id, planCode);
      await this.sendCheckout(ctx, checkout);
    } catch (error) {
      await ctx.reply(this.helper.errorMessage(error));
    }
  }

  private async handleLoyaltyRenew(ctx: Context): Promise<void> {
    const planCode = this.helper.matchId(ctx);
    if (!planCode) return;
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    try {
      await this.helper.typing(ctx);
      const checkout = await this.checkoutService.createCheckout(user.id, planCode);
      const coupon = await this.couponGeneratorService.getOrCreateLoyaltyCoupon(user.id);
      const withCoupon = await this.checkoutService.applyCoupon(checkout.id, coupon.code, user.id);
      await this.sendCheckout(ctx, withCoupon);
    } catch (error) {
      await ctx.reply(this.helper.errorMessage(error));
    }
  }

  private async handleCheckoutCancel(ctx: Context): Promise<void> {
    const checkoutId = this.helper.matchId(ctx);
    if (!checkoutId) return;
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    await this.checkoutService.cancelCheckout(checkoutId, user.id);
    await ctx.reply('Checkout cancelled.', MAIN_KEYBOARD);
  }

  private async handleCheckoutRemoveCoupon(ctx: Context): Promise<void> {
    const checkoutId = this.helper.matchId(ctx);
    if (!checkoutId) return;
    await this.helper.ack(ctx);
    try {
      const user = await this.helper.ensureTelegramUser(ctx);
      const checkout = await this.checkoutService.removeCoupon(checkoutId, user.id);
      await this.sendCheckout(ctx, checkout);
    } catch (error) {
      await ctx.reply(this.helper.errorMessage(error));
    }
  }

  private async handleCheckoutPay(ctx: Context): Promise<void> {
    const checkoutId = this.helper.matchId(ctx);
    if (!checkoutId) return;
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    const checkout = await this.checkoutService.getCheckoutSummary(checkoutId, user.id);
    if (!checkout?.plan) {
      await ctx.reply('Checkout not found.');
      return;
    }

    const tokens = this.paymentService.tokensForPlan(checkout.plan.code);
    await ctx.reply(
      'Choose a token:',
      Markup.inlineKeyboard([
        tokens.map((token) =>
          Markup.button.callback(token, `payment:token:${checkoutId}:${token}`),
        ),
        CANCEL_ROW,
      ]),
    );
  }

  private async handlePaymentToken(ctx: Context): Promise<void> {
    await this.helper.ack(ctx);
    const match = 'match' in ctx ? (ctx.match as RegExpExecArray) : undefined;
    if (!match) return;
    const checkoutId = match[1];
    const token = match[2] as StableTokenSymbol;
    const user = await this.helper.ensureTelegramUser(ctx);
    const checkout = await this.checkoutService.getCheckoutSummary(checkoutId, user.id);
    if (!checkout?.plan) {
      await ctx.reply('Checkout not found.');
      return;
    }

    const networks = this.paymentService.enabledNetworksForPlan(checkout.plan.code);
    await ctx.reply(
      'Choose a network:',
      Markup.inlineKeyboard([
        ...networks.map((network) => [
          Markup.button.callback(
            PAYMENT_CHAINS[network].displayName,
            `paynet:${checkoutId}:${token}:${network}`,
          ),
        ]),
        CANCEL_ROW,
      ]),
    );
  }

  private async handlePaymentNetwork(ctx: Context): Promise<void> {
    await this.helper.ack(ctx);
    const userId = ctx.from?.id;
    if (!userId) return;
    const match = 'match' in ctx ? (ctx.match as RegExpExecArray) : undefined;
    if (!match) return;
    const checkoutId = match[1];
    const token = match[2] as StableTokenSymbol;
    const network = match[3] as PaymentNetwork;

    try {
      await this.helper.typing(ctx);
      const user = await this.helper.ensureTelegramUser(ctx);
      const payment = await this.paymentService.createCryptoPayment(
        user.id, checkoutId, token, network,
      );
      this.conversations.set(userId, { step: 'payment:tx', data: { paymentId: payment.id } });
      await ctx.reply(this.formatPaymentInstructions(payment), {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([CANCEL_ROW]),
      });
    } catch (error) {
      await ctx.reply(this.helper.errorMessage(error));
    }
  }

  private async handlePaymentVerifyRetry(ctx: Context): Promise<void> {
    await this.helper.ack(ctx);
    const paymentId = this.helper.matchId(ctx);
    if (!paymentId) return;
    try {
      const user = await this.helper.ensureTelegramUser(ctx);
      await this.helper.typing(ctx);
      const payment = await this.paymentService.verifyPayment(user.id, paymentId);
      await this.replyPaymentResult(ctx, user.id, payment);
    } catch (error) {
      await ctx.reply(this.helper.errorMessage(error));
    }
  }

  private async handlePaymentResubmit(ctx: Context): Promise<void> {
    await this.helper.ack(ctx);
    const paymentId = this.helper.matchId(ctx);
    const userId = ctx.from?.id;
    if (!paymentId || !userId) return;
    this.conversations.set(userId, { step: 'payment:tx', data: { paymentId } });
    await ctx.reply(
      'Please paste the correct transaction hash (TXID) below.',
      Markup.inlineKeyboard([CANCEL_ROW]),
    );
  }

  async startCouponEntry(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.helper.ack(ctx);
    const checkoutId = this.helper.matchId(ctx);
    if (!checkoutId) return;
    this.conversations.set(userId, { step: 'checkout:coupon', data: { checkoutId } });
    await ctx.reply('Enter your coupon code:', Markup.inlineKeyboard([CANCEL_ROW]));
  }

  async replyPaymentResult(
    ctx: Context,
    userId: string,
    payment: CryptoPayment,
  ): Promise<void> {
    if (payment.verifiedAt) {
      const entitlement = await this.premiumAccessService.getActiveEntitlement(userId);
      await ctx.reply(this.formatters.premiumActivated(entitlement?.expiresAt), {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💬 Open AI Coach', 'ai:coach')],
          MENU_ROW,
        ]),
      });
      return;
    }

    await ctx.reply(
      this.formatters.paymentVerificationFailed(
        payment.verificationError ?? 'We could not find this transaction yet.',
      ),
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Check Again', `payment:verify:${payment.id}`)],
          [Markup.button.callback('✏️ Resubmit Tx Hash', `payment:resubmit:${payment.id}`)],
          MENU_ROW,
        ]),
      },
    );
  }

  async sendCheckout(
    ctx: Context,
    checkout: CheckoutSession & { plan: SubscriptionPlan; coupon?: Coupon | null },
  ): Promise<void> {
    if (checkout.finalAmountUsd.equals(0)) {
      await ctx.reply(this.formatters.checkoutSummary(checkout), { parse_mode: 'Markdown' });
      return;
    }

    await ctx.reply(this.formatters.checkoutSummary(checkout), {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('💳 Pay with Crypto', `checkout:pay:${checkout.id}`)],
        [
          Markup.button.callback(
            checkout.coupon ? '🎟 Change Coupon' : '🎟 Apply Coupon',
            `checkout:coupon:${checkout.id}`,
          ),
        ],
        ...(checkout.coupon
          ? [[Markup.button.callback('❌ Remove Coupon', `checkout:remove_coupon:${checkout.id}`)]]
          : []),
        [Markup.button.callback('Cancel', `checkout:cancel:${checkout.id}`)],
      ]),
    });
  }

  private formatPaymentInstructions(
    payment: CryptoPayment & { checkoutSession?: { plan?: SubscriptionPlan } },
  ): string {
    const planName = payment.checkoutSession?.plan?.name ?? 'Premium';
    return [
      `🧾 *${planName} — Pay with Crypto*`,
      '',
      'Send *exactly* this amount (every digit matters — it links the payment to your order):',
      `\`${formatToken(payment.expectedAmount)} ${payment.tokenSymbol}\``,
      '',
      `Network: *${PAYMENT_CHAINS[payment.network].displayName}*`,
      '',
      'To this address:',
      `\`${payment.receiverAddress}\``,
      '',
      "After sending, paste the transaction hash (TXID) here and I'll verify it on-chain.",
      '',
      '⚠️ *Important:*',
      '• Use only the selected network and token — a different one cannot be verified automatically.',
      '• Verification can take a minute or two while we wait for confirmations.',
    ].join('\n');
  }

  async handleConversationStep(
    ctx: Context,
    state: ConversationState,
    text: string,
  ): Promise<void> {
    const userId = ctx.from!.id;
    const user = await this.helper.ensureTelegramUser(ctx);

    switch (state.step) {
      case 'checkout:coupon': {
        try {
          const checkout = await this.checkoutService.applyCoupon(
            state.data.checkoutId,
            text,
            user.id,
          );
          this.conversations.delete(userId);
          if (checkout.completedAt) {
            const entitlement = await this.premiumAccessService.getActiveEntitlement(user.id);
            await ctx.reply(this.formatters.premiumActivated(entitlement?.expiresAt), {
              parse_mode: 'Markdown',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('💬 Open AI Coach', 'ai:coach')],
                MENU_ROW,
              ]),
            });
          } else {
            await this.sendCheckout(ctx, checkout);
          }
          break;
        } catch (e) {
          const msg = e instanceof BadRequestException ? e.message : 'Something went wrong.';
          await ctx.reply(
            `${msg}\n\nTry another code or tap Cancel.`,
            Markup.inlineKeyboard([CANCEL_ROW]),
          );
        }
        break;
      }

      case 'payment:tx': {
        try {
          await this.paymentService.submitTxHash(user.id, state.data.paymentId, text);
          await ctx.reply(
            '🔍 Checking the blockchain for your payment... this can take up to a minute.',
          );
          await this.helper.typing(ctx);
          const payment = await this.paymentService.verifyPayment(user.id, state.data.paymentId);
          this.conversations.delete(userId);
          await this.replyPaymentResult(ctx, user.id, payment);
        } catch (e) {
          await ctx.reply(this.helper.errorMessage(e));
        }
        break;
      }
    }
  }
}
