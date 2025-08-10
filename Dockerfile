# Use official Node.js runtime as base image
FROM node:18-alpine

# Install Stockfish binary (the key addition for your setup)
RUN apk add --no-cache stockfish

# Set working directory
WORKDIR /usr/src/app

# Copy package files for dependency installation
COPY package*.json ./

# Install dependencies (using npm instead of bun to avoid lockfile issues)
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose the port
EXPOSE 3000

# Start the application (using your existing start script)
CMD ["npm", "start"]
