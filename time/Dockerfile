FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first
COPY package.json ./

# Install all dependencies (including devDependencies for build)
RUN npm install

# Copy source files
COPY tsconfig.json ./
COPY src/ ./src/

# Build the project
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app

COPY --from=builder /app/package.json ./
RUN npm install --production

COPY --from=builder /app/dist ./dist

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

ENV NODE_ENV=production
ENV MCP_TRANSPORT=sse
ENV PORT=3000

ENTRYPOINT ["node", "dist/index.js"]