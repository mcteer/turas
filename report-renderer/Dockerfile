FROM mcr.microsoft.com/playwright@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-impress python3-uno poppler-utils fontconfig && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY report-renderer/package.json report-renderer/package-lock.json ./
RUN npm ci --omit=dev
COPY report-templates/fonts/ /usr/local/share/fonts/turas/
RUN fc-cache -f
COPY report-renderer/ /app/report-renderer/
COPY report-templates/ /app/report-templates/
COPY lib/reports/ /app/lib/reports/
COPY lib/contracts/http.ts /app/lib/contracts/http.ts
ENV TURAS_RENDER_FONT_ROOT=/app/report-templates/fonts
USER pwuser
ENTRYPOINT ["node", "--import", "tsx"]
CMD ["/app/report-renderer/render.ts", "/input/report.json", "/output"]
