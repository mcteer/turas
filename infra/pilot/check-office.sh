#!/bin/sh
set -eu
/usr/bin/python3 /app/report-renderer/office-check.py "$1" "$2"
cp "$2/office.json" "$2/checks.json"
