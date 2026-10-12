# The preparation script builds this base from infra/artifacts/parser.Dockerfile.
ARG PREPARED_BASE
FROM ${PREPARED_BASE}
USER root
COPY --chown=65532:65532 assets/ /assets/
RUN touch /input && chown 65532:65532 /input && mkdir -p /mnt/turas-output && chown 65532:65532 /mnt/turas-output
USER 65532:65532
