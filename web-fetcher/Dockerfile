FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm install --save-dev typescript @types/node && npm run build

FROM node:22-alpine AS runtime

RUN apk add --no-cache \
    chromium \
    chromium-chromedriver \
    tesseract-ocr \
    tesseract-ocr-data-eng \
    font-noto-emoji \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

ENV CHROME_BIN=/usr/bin/chromium-browser
ENV CHROME_PATH=/usr/bin/chromium-browser
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

ENV NODE_ENV=production
ENV MCP_TRANSPORT=sse
ENV PORT=3000

ENTRYPOINT ["node", "dist/index.js"]