# AI Routine Coach - Phase 1

Production-oriented non-AI MVP for Telegram-based routine tracking, accountability, statistics, streaks, and reviews.

Phase 1 deliberately does not integrate OpenAI, generate routines, or provide AI coaching. AI extension points exist only as dependency-inversion ports under `src/ai/ports`.

## Stack

- NestJS and TypeScript
- PostgreSQL with Prisma ORM
- Redis and BullMQ
- Telegraf Telegram bot
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

Set `TELEGRAM_BOT_ENABLED=true` and `TELEGRAM_BOT_TOKEN=<token>` to launch the bot.

For temporary webhook testing through a tunnel such as `tmole 3000`, set:

```bash
PROD_LINK=https://your-temporary-tmole-link
```

When `PROD_LINK` is present, the app registers Telegram webhook mode at
`$PROD_LINK/telegram/webhook`. When `PROD_LINK` is empty, the app uses Telegraf
long polling.

## Telegram Commands

- `/start` registers the Telegram user and opens the dashboard.
- `/goal Title | Description | Category | StartDate | TargetDate`
- `/goals`
- `/routine GoalId | Title | Description | DAILY|WEEKLY|MONTHLY | TargetCount | Minutes`
- `/routines`
- `/today`
- `/progress`
- `/review`
- `/settings timezone=Asia/Tehran weekStartDay=SATURDAY morning=07:00 evening=21:00 weekly=20:00 monthly=20:00`
- `/checkin notes | obstacles | wins`
- `/reflection MonthlyReviewId | went well | held back | next focus`
- `/help`

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
- `src/ai/ports` future AI interfaces with no implementation

## Scheduling

BullMQ registers a repeatable one-minute scheduler tick. On each tick, the worker:

- Reads active users and their preferences.
- Converts current server time into each user's timezone.
- Generates daily tasks at local `00:05`.
- Sends morning reminders at `morningReminderTime`.
- Sends evening check-in prompts at `eveningCheckInTime`.
- Generates weekly reviews on the user's configured week end, derived from `weekStartDay`.
- Generates monthly reviews on the local calendar month end.

No weekdays or review dates are hardcoded.

## Validation

```bash
npm run lint
npm run build
npm test
npm run test:e2e
```
