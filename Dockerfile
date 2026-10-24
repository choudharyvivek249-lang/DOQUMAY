FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install workspace dependencies
RUN npm install

# Copy full repository source
COPY . .

# Build React client for production
RUN npm run build

# Default environment settings
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Launch production server (handles Socket.io, API, and serves client bundle)
CMD ["npm", "start"]
