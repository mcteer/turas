FROM mcr.microsoft.com/playwright@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27
ENV DEBIAN_FRONTEND=noninteractive
COPY infra/ci/apt.conf /etc/apt/apt.conf.d/99turas-ci-timeouts
RUN for apt_source in /etc/apt/sources.list /etc/apt/sources.list.d/ubuntu.sources /etc/apt/apt-mirrors.txt; do \
      if [ -f "$apt_source" ]; then \
        sed -i 's|http://azure.archive.ubuntu.com/ubuntu|https://archive.ubuntu.com/ubuntu|g' "$apt_source"; \
      fi; \
    done \
 && apt-get update && apt-get install -y --no-install-recommends libreoffice-impress python3-uno poppler-utils fontconfig && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY report-renderer/package.json report-renderer/package-lock.json ./
RUN npm ci --omit=dev
COPY report-templates/fonts/ /usr/local/share/fonts/turas/
RUN fc-cache -f
COPY report-renderer/ /app/report-renderer/
COPY report-templates/ /app/report-templates/
COPY lib/reports/ /app/lib/reports/
COPY lib/contracts/http.ts /app/lib/contracts/http.ts
COPY lib/server/operations/code-version.ts /app/lib/server/operations/code-version.ts
COPY --chmod=0555 infra/pilot/render-report.sh /usr/local/bin/turas-render-report
COPY --chmod=0555 infra/pilot/check-office.sh /usr/local/bin/turas-check-office
ENV TURAS_RENDER_FONT_ROOT=/app/report-templates/fonts
USER pwuser
ENTRYPOINT ["node", "--import", "tsx"]
CMD ["/app/report-renderer/render.ts", "/input/report.json", "/output"]
