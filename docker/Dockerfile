FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY dist/ ./dist/

EXPOSE 4100

CMD ["node", "dist/index.js"]
