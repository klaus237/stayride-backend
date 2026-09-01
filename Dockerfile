# ─── Stage 1: Base ────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package*.json ./

# ─── Stage 2: Development ─────────────────────────────────────────────────────
FROM base AS development
ENV NODE_ENV=development
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# ─── Stage 3: Build ───────────────────────────────────────────────────────────
FROM base AS builder
ENV NODE_ENV=production
RUN npm ci --only=production && npm cache clean --force
RUN npm install -g @nestjs/cli
COPY . .
RUN npm run build

# ─── Stage 4: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Utilisateur non-root pour la sécurité
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nestjs

COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json

USER nestjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main"]
