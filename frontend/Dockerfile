FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json vite.config.ts ./
# src, index.html, public are volume-mounted at runtime for hot reload
CMD ["npm", "run", "dev", "--", "--host"]
