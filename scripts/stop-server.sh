#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${ROOT_DIR}/.server.pid"

if [[ ! -f "${PID_FILE}" ]]; then
  echo "No PID file found. Server may not be running."
  exit 0
fi

PID="$(cat "${PID_FILE}")"
if kill -0 "${PID}" 2>/dev/null; then
  kill "${PID}"
  echo "Stopped server (PID ${PID})."
else
  echo "Process ${PID} not running. Removing stale PID file."
fi

rm -f "${PID_FILE}"
