FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
# src is volume-mounted at runtime for hot reload
CMD ["npm", "run", "dev:local"]
