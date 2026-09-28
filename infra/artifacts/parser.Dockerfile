FROM node:24.13.0-bookworm-slim@sha256:4660b1ca8b28d6d1906fd644abe34b2ed81d15434d26d845ef0aced307cf4b6f AS build
WORKDIR /opt/artifact-extractor
COPY packages/artifact-extractor/package.json packages/artifact-extractor/package-lock.json ./
RUN npm ci --ignore-scripts
COPY packages/artifact-extractor/src ./src
COPY packages/artifact-extractor/tsconfig.json ./tsconfig.json
RUN npm run build && npm prune --omit=dev

FROM node:24.13.0-bookworm-slim@sha256:4660b1ca8b28d6d1906fd644abe34b2ed81d15434d26d845ef0aced307cf4b6f
ENV NODE_ENV=production
ENV TURAS_OCR_ASSET_ROOT=/assets
WORKDIR /opt/artifact-extractor
COPY --from=build --chown=65532:65532 /opt/artifact-extractor ./
USER 65532:65532
ENTRYPOINT ["node", "dist/main.js"]
