# ── Stage 1: install all dependencies ────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── Stage 2: compile TypeScript + generate Prisma client ─────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Run generate + compile directly — do NOT call `npm run build` because that
# script also runs `prisma migrate deploy` and `prisma db seed`, which require
# a live database and must only happen at container startup, not at build time.
RUN npx prisma generate && npx nest build

# ── Stage 3: lean production image ───────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./

# Install production deps. Prisma CLI is a devDep but is needed at runtime to
# run `prisma migrate deploy` on startup, so we add it explicitly here.
RUN npm ci --omit=dev && npm install --no-save prisma

# Compiled app
COPY --from=build /app/dist ./dist

# Prisma schema + migrations (needed by `prisma migrate deploy` at startup)
COPY --from=build /app/prisma ./prisma

# Generated Prisma client (query engine binary + type defs)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client

EXPOSE 3000

# Startup: run any pending migrations, then boot the app.
# Seed is intentionally excluded — run it once manually after first deploy:
#   docker compose exec app npx prisma db seed
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
