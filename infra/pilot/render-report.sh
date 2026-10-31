#!/bin/sh
set -eu
# Paths are selected by the fixed server program, never by report content.
node --import tsx /app/report-renderer/render.ts "$1" "$2"
# Validator errors can include report-derived values. Expose only the fixed
# stage category; never forward its Python traceback to operational telemetry.
if ! /usr/bin/python3 /app/report-renderer/validate.py "$2" > "$2/checks.json" 2>/dev/null; then
  echo renderer_validation_failed >&2
  exit 1
fi
