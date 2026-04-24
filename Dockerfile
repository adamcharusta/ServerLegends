FROM node:22-alpine

RUN apk add --no-cache \
  python3 \
  make \
  g++ \
  cairo-dev \
  pango-dev \
  jpeg-dev \
  giflib-dev \
  librsvg-dev \
  pixman-dev \
  fontconfig \
  ttf-dejavu

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

CMD ["node", "src/index.js"]
