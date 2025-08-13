# Use official Node.js runtime as base image
FROM node:18-alpine

# Install Stockfish chess engine
RUN apk add --no-cache stockfish

# Set working directory
WORKDIR /usr/src/app

# Copy package files for dependency installation
COPY package*.json ./

# Install ALL dependencies (including dev dependencies for TypeScript build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Remove dev dependencies to reduce image size (keep only production)
RUN npm prune --production

# Expose the port
EXPOSE 3000

# Start the application (using your existing start script)
CMD ["npm", "start"]
