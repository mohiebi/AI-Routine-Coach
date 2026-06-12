# AI Routine Coach

Telegram-based routine tracking, accountability, progress reporting, and premium AI coaching.

The product has two layers:

- **Free deterministic core**: users, goals, routines, daily tasks, check-ins, streaks, health scores, weekly/monthly reviews, notifications, and progress dashboards.
- **Premium AI enhancement layer**: goal review, goal breakdown, routine recommendations, weekly/monthly coaching, accountability coach, routine optimization, and progress insights.

The core platform does not depend on AI. If `OPENAI_API_KEY` is missing or OpenAI is unavailable, all non-AI tracking features continue to work.

## Stack

- NestJS and TypeScript
- PostgreSQL with Prisma ORM
- Redis and BullMQ
- Telegraf Telegram bot
- OpenAI Responses API for premium AI features
- Swagger at `/docs`
- Structured logging with `nestjs-pino`
- Docker and Docker Compose

## Setup

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:dev
npm run start:dev
```

For local Docker:

```bash
cp .env.example .env
docker compose up --build
```

## Environment

Required for the core app:

```env
DATABASE_URL=postgresql://routine:routine@localhost:5432/routine?schema=public
REDIS_HOST=localhost
REDIS_PORT=6379
TELEGRAM_BOT_ENABLED=true
TELEGRAM_BOT_TOKEN=
```

Optional Telegram webhook mode:

```env
PROD_LINK=https://your-temporary-tunnel-link
TELEGRAM_WEBHOOK_SECRET=
```

When `PROD_LINK` is present, the app registers Telegram webhook mode at:

```text
$PROD_LINK/telegram/webhook
```

When `PROD_LINK` is empty, the app uses Telegraf long polling.

Optional premium AI layer:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
OPENAI_TIMEOUT_MS=20000
OPENAI_MAX_RETRIES=2
OPENAI_CIRCUIT_FAILURE_THRESHOLD=5
OPENAI_CIRCUIT_RESET_MS=60000
AI_INPUT_COST_PER_1M=0.75
AI_OUTPUT_COST_PER_1M=4.50
```

`OPENAI_API_KEY` may be omitted during development. The app will boot normally; premium AI requests will fail gracefully.

Premium checkout and crypto payment verification:

```env
PREMIUM_MONTHLY_PRICE_USD=10
PREMIUM_YEARLY_PRICE_USD=99
COUPON_CODE_FREE=

PAYMENT_RECEIVER_ETHEREUM_ADDRESS=
PAYMENT_RECEIVER_ARBITRUM_ADDRESS=
PAYMENT_RECEIVER_BSC_ADDRESS=

PAYMENT_CHAIN_ETHEREUM_ENABLED=true
PAYMENT_CHAIN_ARBITRUM_ENABLED=true
PAYMENT_CHAIN_BSC_ENABLED=false

ETHERSCAN_API_KEY=
PAYMENT_CHECKOUT_EXPIRES_MINUTES=30
```

Receiver wallet addresses are always read from environment variables. BSC is present in the chain/token configuration, but disabled by default because Etherscan BSC access may require a paid tier. With the default config, Monthly Premium accepts Arbitrum only; Yearly Premium accepts Arbitrum and Ethereum.

## Telegram Usage

Core commands:

- `/start` registers the Telegram user and opens the dashboard.
- `/goals` shows active goals and goal management buttons.
- `/routines` shows active routines and routine management buttons.
- `/today` shows today’s generated tasks with complete, skip, and fail buttons.
- `/progress` shows health scores, streaks, and completion rates.
- `/review` generates or shows the current weekly review.
- `/settings` opens timezone, week start, and reminder preferences.
- `/help` shows the Telegram menu guide.

Premium AI command:

```text
/coach I keep skipping workouts
```

Premium AI buttons are available from Telegram screens:

- Goal detail: `AI Review`, `AI Breakdown`, `Suggest Routines`
- Progress: `AI Insights`, `Optimize Routines`
- Review: `Analyze My Week`

AI never creates or modifies goals/routines unless the user explicitly accepts a suggestion.

Premium checkout command:

```text
/premium
```

Free users who tap an AI button are shown the Premium upgrade flow. Coupons are optional and secondary; the user can pay without entering a coupon.

## Premium Access

Premium is controlled by `PremiumEntitlement`, not by a user flag. Free users can continue using all deterministic tracking features; only AI features require an active entitlement.

Available plans are seeded into `SubscriptionPlan`, with prices read from `PREMIUM_MONTHLY_PRICE_USD` and `PREMIUM_YEARLY_PRICE_USD`:

- `PREMIUM_MONTHLY`: 30 days, Arbitrum, USDT/USDC.
- `PREMIUM_YEARLY`: 365 days, Arbitrum/Ethereum, USDT/USDC.

Activation rules:

- A 100% coupon completes the checkout and activates premium immediately.
- A partial coupon recalculates the payable amount, then the user pays the remaining amount in crypto.
- A submitted TXID never activates premium by itself. The app verifies the EVM token transfer before creating or extending the entitlement.
- Existing active premium is extended from the current expiry; otherwise the new entitlement starts immediately.

After migrations, seed the plans:

```bash
npx prisma db seed
```

Changing plan prices in `.env` affects new checkout sessions at runtime. Run the seed again when you also want the stored `SubscriptionPlan` rows updated in the database.

Payment verification uses Etherscan API V2 and checks receipt success, ERC20 `Transfer` logs, token contract, receiver wallet, amount, duplicate TXID, and chain confirmations.

## Checkout REST Endpoints

Plan and checkout endpoints:

- `GET /users/:userId/premium`
- `GET /users/:userId/premium/plans`
- `POST /users/:userId/checkouts`
- `GET /users/:userId/checkouts/:checkoutId`
- `POST /users/:userId/checkouts/:checkoutId/coupon`
- `DELETE /users/:userId/checkouts/:checkoutId/coupon`
- `POST /users/:userId/checkouts/:checkoutId/cancel`

Payment endpoints:

- `POST /users/:userId/checkouts/:checkoutId/payments`
- `POST /users/:userId/payments/:paymentId/tx`
- `POST /users/:userId/payments/:paymentId/verify`

## AI REST Endpoints

All AI endpoints are under:

```text
/users/:userId/ai
```

Available endpoints:

- `POST /goals/:goalId/review`
- `POST /goal-reviews/:reviewId/accept`
- `POST /goals/:goalId/breakdown`
- `POST /goals/:goalId/routine-recommendations`
- `POST /routine-recommendations/:batchId/accept`
- `POST /weekly-reviews/:weeklyReviewId/analyze`
- `POST /monthly-reviews/:monthlyReviewId/analyze`
- `POST /routines/optimize`
- `POST /progress/insights`
- `POST /coach`

Every AI request is logged in `AIInteraction` with feature, prompt summary, sanitized response, model, token counts, estimated cost, status, and error message when applicable.

## Architecture

The codebase is organized by business capability:

- `src/users` registration and user preferences
- `src/goals` goal CRUD and deterministic health scoring
- `src/routines` manually created routine management
- `src/tasks` daily task generation, completion, and streak refresh
- `src/check-ins` daily check-in persistence
- `src/reviews` weekly and monthly review snapshots
- `src/progress` dashboard aggregation
- `src/telegram` Telegraf command and callback adapter
- `src/scheduler` BullMQ repeatable scheduler
- `src/notifications` notification audit log
- `src/prisma` Prisma lifecycle service
- `src/premium` entitlement source of truth for paid access
- `src/checkout` plan checkout and coupon totals
- `src/payments` EVM stablecoin payment creation and verification
- `src/ai` isolated premium AI layer
- `src/ai/ports` future AI provider interfaces

AI code is isolated from core tracking logic. Deterministic calculations remain in backend services, not prompts.

## Scheduling

BullMQ registers a repeatable one-minute scheduler tick. On each tick, the worker:

- Reads active users and their preferences.
- Converts current server time into each user’s timezone.
- Generates daily tasks at local `00:05`.
- Sends morning reminders at `morningReminderTime`.
- Sends evening check-in prompts at `eveningCheckInTime`.
- Generates weekly reviews using the user’s configured `weekStartDay`.
- Generates monthly reviews on the local calendar month end.

No weekdays or review dates are hardcoded.

For Vercel/serverless deploys, the web function automatically disables the BullMQ scheduler because serverless functions should not run long-lived Redis workers. Keep or set this explicitly in Vercel:

```env
SCHEDULER_ENABLED=false
```

Run scheduled reminders/reviews from a separate worker deployment with Redis configured, or from local/Docker during development.

## Database

Run migrations locally:

```bash
npm run prisma:dev
```

Apply migrations in deployed environments:

```bash
npm run prisma:migrate
```

Generate Prisma Client:

```bash
npm run prisma:generate
```

## Validation

```bash
npm run build
npm test
```

Optional:

```bash
npm run lint
npm run test:e2e
```

## Current Notes

- The OpenAI package is installed, but live AI calls require `OPENAI_API_KEY`.
- AI uses strict structured JSON outputs and DTO validation before storage.
- AI usage is counted only after successful validated responses.
- Routine optimization is limited to once every 4 weeks.
- Archived/deleted goals and routines are excluded from progress, review, task, and AI context summaries.
