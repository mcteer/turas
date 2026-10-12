# The preparation script builds this base from infra/artifacts/scanner.Dockerfile.
ARG PREPARED_BASE
FROM ${PREPARED_BASE}
USER root
COPY --chown=100:101 signatures/ /signatures/
RUN touch /input && chown 100:101 /input && mkdir -p /mnt/turas-output && chown 100:101 /mnt/turas-output
USER 100:101
