# Etapa 1: build de la SPA
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack prepare --activate $(node -p "require('./package.json').packageManager") \
    && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Etapa 2: nginx sirviendo estáticos + proxy /api
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
