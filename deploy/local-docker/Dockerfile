FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV TOKEN_REPORTING_BASE_PATH=/tools/token-reporting
RUN npm run build:projectit

ENV NODE_ENV=production
ENV TOKEN_REPORTING_HOST=0.0.0.0
ENV TOKEN_REPORTING_PORT=8080
ENV TOKEN_REPORTING_PUBLIC_BASE_PATH=/tools/token-reporting
ENV TOKEN_REPORTING_DATA_ROOT=/app/public/data
ENV TOKEN_REPORTING_DIST_ROOT=/app/dist
ENV TOKEN_REPORTING_LOG_ROOT=/app/logs

EXPOSE 8080

CMD ["npm", "run", "serve:production"]
