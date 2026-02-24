FROM node:20-alpine

WORKDIR /usr/src/app

# Install dependencies (production). For development, mount source and use npm install locally.
COPY package*.json ./
RUN npm ci --production

# Copy app source
COPY . .

EXPOSE 4000

CMD ["node", "index.js"]
