# Stage 1: Build React client
FROM node:20-slim AS builder
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install workspace dependencies
RUN npm install

# Copy source and build client
COPY . .
RUN npm run build -w client

# Stage 2: Minimal production runner
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy root and server package manifests
COPY package*.json ./
COPY server/package*.json ./server/

# Install only production server dependencies (lightweight, no build tools)
RUN npm install --omit=dev --workspace=server

# Copy server application and built client assets
COPY server/ ./server/
COPY --from=builder /app/client/dist ./client/dist

# Render provides PORT dynamically (default 3001)
ENV PORT=3001
EXPOSE 3001

# Launch production server
CMD ["npm", "start"]
