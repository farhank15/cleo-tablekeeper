FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
EXPOSE 8080
ENV PORT=8080
CMD ["node","src/server.js"]
