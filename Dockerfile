# 多阶段构建：builder 装依赖，runner 只带产物
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
# 非 root 用户运行
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && mkdir -p /app/uploads /app/data \
    && chown -R appuser:appgroup /app/uploads /app/data
USER appuser
EXPOSE 3000 3001
CMD ["node", "server/index.js"]