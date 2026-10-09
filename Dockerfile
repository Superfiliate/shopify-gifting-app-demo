FROM node:24-bookworm-slim
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
ENV COREPACK_HOME=/opt/corepack
RUN corepack prepare pnpm@12.3.4 --activate && chmod -R a+rX /opt/corepack
WORKDIR /app
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY --chown=node:node . .
RUN pnpm build
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["pnpm", "start"]
