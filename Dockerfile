FROM oven/bun:1.4.4 AS build
ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM nginxinc/nginx-unprivileged:1.31.7-alpine3.24
# Runs as uid 101; the entrypoint writes config.js and the security-headers snippet at startup.
COPY --from=build --chown=101:101 /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker-entrypoint.sh /docker-entrypoint.sh
USER root
RUN mkdir -p /etc/nginx/snippets && chown 101:101 /etc/nginx/snippets
USER 101
EXPOSE 8080
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
