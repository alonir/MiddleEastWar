#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${ROOT_DIR}/.server.pid"
LOG_FILE="${ROOT_DIR}/server.log"

if [[ -f "${PID_FILE}" ]]; then
  EXISTING_PID="$(cat "${PID_FILE}")"
  if kill -0 "${EXISTING_PID}" 2>/dev/null; then
    echo "Server is already running (PID ${EXISTING_PID})."
    exit 0
  fi
  echo "Removing stale PID file."
  rm -f "${PID_FILE}"
fi

cd "${ROOT_DIR}"
if lsof -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 3000 is already in use. Stop the running server first."
  exit 1
fi

# Hardcoded local default Google OAuth client ID.
export GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-725887797200-5lujm87rhiun0s3t2125e10al9vt6n8s.apps.googleusercontent.com}"

if [[ -z "${SESSION_SECRET:-}" ]]; then
  # Local fallback secret so auth cookies can be signed; replace in production.
  export SESSION_SECRET="3Qp4U2wDk5mJ8xNc9vRf1sTb7hLp0zYe6AaQnMi4"
fi

nohup node src/server/server.js >> "${LOG_FILE}" 2>&1 &
SERVER_PID=$!
echo "${SERVER_PID}" > "${PID_FILE}"

echo "Server started (PID ${SERVER_PID})."
echo "Logs: ${LOG_FILE}"
