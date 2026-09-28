#!/bin/sh
set -eu

clamd --config-file=/etc/clamav/clamd.conf --fail-if-cvd-older-than=7 > /tmp/clamd.log 2>&1 &
daemon_pid=$!
trap 'kill "$daemon_pid" 2>/dev/null || true' EXIT HUP INT TERM
if ! clamdscan --config-file=/etc/clamav/clamd.conf --ping=30:1 >/dev/null 2>&1; then
  echo 'scan_unavailable' >&2
  exit 2
fi
clamdscan --config-file=/etc/clamav/clamd.conf --no-summary /input
