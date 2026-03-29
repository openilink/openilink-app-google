# 多阶段构建：node:20-alpine
# 第一阶段：安装依赖和编译 TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

# 安装 better-sqlite3 编译依赖
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

# 第二阶段：生产运行镜像
FROM node:20-alpine

RUN apk add --no-cache tini \
  && addgroup -S app && adduser -S -G app app \
  && mkdir -p /data /app \
  && chown -R app:app /data /app

WORKDIR /app

COPY package.json package-lock.json ./
RUN apk add --no-cache python3 make g++ \
  && npm ci --omit=dev \
  && apk del python3 make g++

COPY --from=builder /app/dist/ dist/

RUN chown -R app:app /app

USER app

ENV PORT=8086
ENV DB_PATH=/data/google.db

EXPOSE 8086

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
