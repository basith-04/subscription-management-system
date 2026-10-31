# syntax=docker/dockerfile:1

# Node.js build (default)
FROM node:22-alpine AS node-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node-deps AS node-build
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS node
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=node-build /app/dist /usr/share/nginx/html
EXPOSE 80

# Bun build
FROM oven/bun:1-alpine AS bun-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM bun-deps AS bun-build
COPY . .
RUN bun run build

FROM nginx:1.27-alpine AS bun
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=bun-build /app/dist /usr/share/nginx/html
EXPOSE 80
