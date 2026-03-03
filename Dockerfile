FROM node:20-bullseye-slim

WORKDIR /usr/src/app

# Install dependencies (production). For development, mount source and use npm install locally.
COPY package*.json ./
RUN npm ci --production

# Copy app source
COPY . .

# Generate Prisma client for the runtime environment (ensure prisma client engine is available)
RUN npx prisma generate || true

EXPOSE 4000

# entrypoint now moved to server.js (contains the Express setup)
CMD ["node", "server.js"]
