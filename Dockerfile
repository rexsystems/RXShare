FROM node:22-slim AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3, sharp)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .
RUN npm run build

# Drop dev dependencies here, where the toolchain for native modules (better-sqlite3, sharp) exists
RUN npm prune --omit=dev

# --- Production ---
FROM node:22-slim

WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/system-settings/public').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
