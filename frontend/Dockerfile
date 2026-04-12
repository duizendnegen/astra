FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json vite.config.ts ./
COPY src ./src
COPY index.html ./
COPY public ./public
CMD ["npm", "run", "dev", "--", "--host"]
