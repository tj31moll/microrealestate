FROM node:20-alpine AS base

FROM base AS deps
RUN apk --no-cache add build-base python3
RUN corepack enable && \
    corepack prepare yarn@3.3.0 --activate
WORKDIR /usr/app
COPY package.json .
COPY .yarnrc.yml .
COPY yarn.lock .
COPY .yarn/plugins .yarn/plugins
COPY .yarn/releases .yarn/releases
COPY types types
COPY services/typed-common services/typed-common
COPY services/gateway/package.json services/gateway/package.json
RUN --mount=type=cache,id=node_modules,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn \
    yarn workspaces focus @microrealestate/gateway && \
    yarn workspace @microrealestate/types run build && \
    yarn workspace @microrealestate/typed-common run build 

FROM base
WORKDIR /usr/app
COPY --from=deps /usr/app ./
CMD ["yarn", "workspace", "@microrealestate/gateway", "run", "dev"]
