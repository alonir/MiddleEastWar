#!/usr/bin/env bash
set -euo pipefail

# Sync current source to Google Cloud Run by building from source.
# Usage:
#   bash scripts/sync-to-gcloud.sh [PROJECT_ID] [SERVICE_NAME] [REGION]
#
# Example:
#   bash scripts/sync-to-gcloud.sh middleeastwar middleeastwar us-central1

# Resolution order:
# 1) CLI args
# 2) Environment vars: GCP_PROJECT_ID, GCP_SERVICE_NAME, GCP_REGION
# 3) gcloud config defaults (project and run/region)
# 4) hard defaults for service/region
PROJECT_ID="${1:-${GCP_PROJECT_ID:-}}"
SERVICE_NAME="${2:-${GCP_SERVICE_NAME:-middleeastwar}}"
REGION="${3:-${GCP_REGION:-}}"
CURRENT_STEP="initialization"

# Same default as src/server/server.js. Override with env GOOGLE_CLIENT_ID when needed.
DEFAULT_GOOGLE_CLIENT_ID='25887797200-sfdh09dhutqmnfq51t79eibtrl3b77j4.apps.googleusercontent.com'
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-${DEFAULT_GOOGLE_CLIENT_ID}}"

# Web client ID only (APIs & Services → Credentials → OAuth 2.0 Client ID). Not service account JSON "client_id".
# Normalize pasted secrets (quotes, BOM, newlines) and validate each comma-separated ID.
if ! GOOGLE_CLIENT_ID="$(
  printf '%s' "${GOOGLE_CLIENT_ID}" | python3 -c "
import re, sys
full = sys.stdin.read().strip().strip('\"').strip(\"'\")
full = full.lstrip('\ufeff')
full = ''.join(full.split())
if not full:
    sys.exit(1)
pat = re.compile(r'^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$')
for part in full.split(','):
    part = part.strip()
    if not pat.match(part):
        sys.exit(1)
print(full, end='')
")"; then
  echo "[sync-to-gcloud] GOOGLE_CLIENT_ID must look like: 123456789-xxxxx.apps.googleusercontent.com"
  echo "[sync-to-gcloud] (Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs → Web client.)"
  echo "[sync-to-gcloud] Paste only the Client ID string — no quotes, spaces, or placeholders like [Credentials]."
  exit 1
fi
if [[ -z "${SESSION_SECRET:-}" ]]; then
  echo "[sync-to-gcloud] Set SESSION_SECRET (long random string; never commit it)."
  exit 1
fi

log() {
  echo "[sync-to-gcloud] $*"
}

fail() {
  local exit_code=$?
  echo
  echo "[sync-to-gcloud] ERROR during step: ${CURRENT_STEP}"
  echo "[sync-to-gcloud] Command: ${BASH_COMMAND}"
  echo "[sync-to-gcloud] Exit code: ${exit_code}"
  echo
  echo "[sync-to-gcloud] Hints:"
  echo "  - Check PROJECT_ID is the project ID string (not project number)."
  echo "  - gcloud run deploy --source needs project-level storage.buckets.list plus bucket access:"
  echo "    grant roles/storage.admin on the PROJECT (not only on the run-sources-* bucket)."
  echo "  - Also grant: roles/run.admin, roles/cloudbuild.builds.editor,"
  echo "    roles/artifactregistry.writer, roles/iam.serviceAccountUser."
  echo "  - If API enable fails: run services enable as a project Owner once, or grant"
  echo "    roles/serviceusage.serviceUsageAdmin (narrower custom roles are possible)."
  echo "  - Ensure billing is enabled on the project."
}

trap fail ERR

RUN_ENV_FILE=""
cleanup_run_env_file() {
  [[ -n "${RUN_ENV_FILE}" ]] && rm -f "${RUN_ENV_FILE}"
}
trap cleanup_run_env_file EXIT

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI not found. Install it first."
  exit 1
fi

if [[ -z "${PROJECT_ID}" ]]; then
  PROJECT_ID="$(gcloud config get-value project 2>/dev/null || true)"
fi
if [[ -z "${REGION}" ]]; then
  REGION="$(gcloud config get-value run/region 2>/dev/null || true)"
fi
if [[ -z "${REGION}" ]]; then
  REGION="us-central1"
fi
if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "Missing project id."
  echo "Set one of:"
  echo "  - argument 1: bash scripts/sync-to-gcloud.sh <PROJECT_ID>"
  echo "  - env var: export GCP_PROJECT_ID=<PROJECT_ID>"
  echo "  - gcloud default: gcloud config set project <PROJECT_ID>"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

log "Using project: ${PROJECT_ID}"
log "Using service: ${SERVICE_NAME}"
log "Using region: ${REGION}"
log "Working directory: ${ROOT_DIR}"

CURRENT_STEP="configure gcloud defaults"
gcloud config set project "${PROJECT_ID}"
gcloud config set run/region "${REGION}"

CURRENT_STEP="enable required APIs"
if ! gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --project "${PROJECT_ID}" \
  --quiet; then
  log "Could not enable one or more required APIs with current identity."
  log "Proceeding assuming APIs were enabled beforehand by a project admin."
fi

CURRENT_STEP="deploy to cloud run"
# Pass env to Cloud Run via YAML so commas/special characters in secrets are not broken by --set-env-vars.
RUN_ENV_FILE="$(mktemp)"
export GOOGLE_CLIENT_ID SESSION_SECRET
python3 -c '
import json, os, sys
path = sys.argv[1]
with open(path, "w", encoding="utf-8") as f:
    for name in ("GOOGLE_CLIENT_ID", "SESSION_SECRET"):
        f.write(f"{name}: {json.dumps(os.environ[name])}\n")
' "${RUN_ENV_FILE}"

gcloud run deploy "${SERVICE_NAME}" \
  --source . \
  --region "${REGION}" \
  --allow-unauthenticated \
  --platform managed \
  --env-vars-file="${RUN_ENV_FILE}" \
  --project "${PROJECT_ID}" \
  --quiet

CURRENT_STEP="fetch service url"
SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --project "${PROJECT_ID}" --format='value(status.url)')"
log "Deployment completed."
log "Service URL: ${SERVICE_URL}"

