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

# Load .env into this shell so nohup inherits GOOGLE_CLIENT_ID / SESSION_SECRET (optional; server also loads .env via dotenv).
if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${ROOT_DIR}/.env"
  set +a
fi

# Fresh log for each start (append below would otherwise keep growing forever).
: > "${LOG_FILE}"

nohup node src/server/server.js >> "${LOG_FILE}" 2>&1 &
SERVER_PID=$!
echo "${SERVER_PID}" > "${PID_FILE}"

echo "Server started (PID ${SERVER_PID})."
echo "Logs: ${LOG_FILE}"
