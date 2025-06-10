FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build the TypeScript code
RUN npm run build

# Set SSE transport environment variable
ENV MCP_TRANSPORT=sse

# Expose port (default 3000)
EXPOSE 3000

# Run the server
CMD ["node", "dist/index.js"]