# syntax=docker/dockerfile:1

# Node.js runtime (default)
FROM node:22-alpine AS node-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node-deps AS node-build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS node
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=node-build /app/dist ./dist
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]

# Bun runtime
FROM oven/bun:1-alpine AS bun
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY tsconfig.json ./
COPY src ./src
USER bun
EXPOSE 4000
CMD ["bun", "src/index.ts"]
