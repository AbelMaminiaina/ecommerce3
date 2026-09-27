# Backend Dockerfile - Tsena
FROM node:20-alpine AS base

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .

# Build TypeScript (without db push)
RUN npm run build:docker

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 expressjs

# Copy necessary files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# Images téléversées : monté comme volume Docker en production (voir docker-compose)
RUN mkdir -p /app/uploads
ENV UPLOAD_DIR=/app/uploads

# Set ownership
RUN chown -R expressjs:nodejs /app

USER expressjs

EXPOSE 3001

ENV PORT=3001

# Start the server : migrations, conversion des anciennes images base64 en fichiers (sans effet s'il n'y en a
# plus ; un échec n'empêche pas le démarrage), puis l'API
CMD ["sh", "-c", "npx prisma migrate deploy && (node dist/scripts/migrateImagesToFiles.js || true) && node dist/index.js"]
