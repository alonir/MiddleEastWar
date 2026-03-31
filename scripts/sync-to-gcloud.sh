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
# Hardcoded auth env values for deployed service.
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-725887797200-5lujm87rhiun0s3t2125e10al9vt6n8s.apps.googleusercontent.com}"
SESSION_SECRET="${SESSION_SECRET:-3Qp4U2wDk5mJ8xNc9vRf1sTb7hLp0zYe6AaQnMi4}"
CURRENT_STEP="initialization"

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
  echo "  - Ensure deploy identity has: Cloud Run Admin, Cloud Build Editor,"
  echo "    Artifact Registry Writer, and Service Account User."
  echo "  - Ensure billing is enabled and required APIs are allowed."
}

trap fail ERR

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
gcloud run deploy "${SERVICE_NAME}" \
  --source . \
  --region "${REGION}" \
  --allow-unauthenticated \
  --platform managed \
  --set-env-vars "GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID},SESSION_SECRET=${SESSION_SECRET}" \
  --project "${PROJECT_ID}" \
  --quiet

CURRENT_STEP="fetch service url"
SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --project "${PROJECT_ID}" --format='value(status.url)')"
log "Deployment completed."
log "Service URL: ${SERVICE_URL}"

