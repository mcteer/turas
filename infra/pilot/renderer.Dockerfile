# The preparation script builds this base from report-renderer/Dockerfile.
ARG PREPARED_BASE
FROM ${PREPARED_BASE}
USER root
COPY --chmod=0555 infra/pilot/render-report.sh /usr/local/bin/turas-render-report
COPY --chmod=0555 infra/pilot/check-office.sh /usr/local/bin/turas-check-office
RUN mkdir -p /mnt/turas-input /mnt/turas-output && chown pwuser:pwuser /mnt/turas-input /mnt/turas-output
USER pwuser
