#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"${SCRIPT_DIR}/stop-server.sh"

# Wait until nothing is listening on 3000 (or timeout) so start-server.sh can bind.
for ((i = 0; i < 30; i++)); do
  if ! lsof -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

"${SCRIPT_DIR}/start-server.sh"
