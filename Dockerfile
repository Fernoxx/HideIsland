# Container image for Hide Island — works on Fly.io, Railway, Render (Docker),
# Cloud Run, or any container host. Runs a persistent Node server (required for
# Socket.IO / the real-time game loop).
FROM node:20-alpine

WORKDIR /app

# Install dependencies (three.js is a runtime dep — it's served to the client).
COPY package*.json ./
RUN npm install --omit=dev

# App source.
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
