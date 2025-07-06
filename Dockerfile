ARG NODE_VERSION=22.17.0
ARG PNPM_VERSION=10.12.4

################################################################################
FROM node:${NODE_VERSION}-alpine AS base
RUN env | grep -i _PROXY


RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm@${PNPM_VERSION}

WORKDIR /app

################################################################################
# Create a stage for installing production dependecies.
FROM base AS deps

RUN apk add --no-cache git

WORKDIR /app/ui
COPY ui/pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm fetch --frozen-lockfile
COPY ui/package.json ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --prod

WORKDIR /app
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm fetch --frozen-lockfile
COPY package.json ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --prod

################################################################################
# Create a stage for building the application.
FROM deps AS build

# Download additional development dependencies before building, as some projects require
# "devDependencies" to be installed to build. If you don't need this, remove this step.
WORKDIR /app/ui
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm fetch --frozen-lockfile
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

WORKDIR /app
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm fetch --frozen-lockfile
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# Copy the rest of the source files into the image.
COPY . .
# Run the build script.
WORKDIR /app/ui
RUN pnpm run build-only && pnpm run build:inner
RUN rm -rf node_modules src public

WORKDIR /app
RUN pnpm run build

################################################################################
# Create a new stage to run the application with minimal runtime dependencies
# where the necessary files are copied from the build stage.
FROM base AS final

# Use production node environment by default.
ENV NODE_ENV=production

# Run the application as a non-root user.
USER node

# Copy package.json so that package manager commands can be used.
COPY package.json .

# Copy the production dependencies from the deps stage and also
# the built application from the build stage into the image.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/bin ./bin
COPY --from=build /app/migrations ./migrations

COPY --from=build /app/ui/dist ./ui/dist


# Expose the port that the application listens on.
EXPOSE 3000

# Run the application.
CMD pnpm start
