FROM clamav/clamav:1.5.4-debian13-slim@sha256:9bb8712a50f0e75166e936c452cd82dd5e5be0b85586598930b5bbb84a99a578
COPY infra/artifacts/clamd.conf /etc/clamav/clamd.conf
COPY --chmod=0555 infra/artifacts/scan-artifact.sh /usr/local/bin/scan-artifact
USER 100:101
ENTRYPOINT ["/usr/local/bin/scan-artifact"]
