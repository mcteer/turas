#!/bin/sh
set -eu
# Paths are selected by the fixed server program, never by report content.
node --import tsx /app/report-renderer/render.ts "$1" "$2"
/usr/bin/python3 /app/report-renderer/validate.py "$2" > "$2/checks.json"
