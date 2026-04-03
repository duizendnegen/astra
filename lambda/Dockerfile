FROM node:20-slim
WORKDIR /app

# Build tools needed to compile native modules (better-sqlite3, sqlite-vec)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install
COPY tsconfig.json ./
# src is volume-mounted at runtime for hot reload
CMD ["npm", "run", "dev:local"]
