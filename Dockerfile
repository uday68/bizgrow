# Use Node.js 20 Alpine for compatibility with latest packages
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache sqlite

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/

# Install ALL dependencies (including dev dependencies for build)
RUN npm ci
RUN cd server && npm ci

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Create database directory
RUN mkdir -p server/database

# Initialize database
RUN cd server && npm run init-db

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S bizgrow -u 1001

# Change ownership of app directory
RUN chown -R bizgrow:nodejs /app
USER bizgrow

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Set working directory to server and start
WORKDIR /app/server
CMD ["node", "index.js"]