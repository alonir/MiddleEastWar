#!/usr/bin/env bash
set -euo pipefail

# Sync current source to Google Cloud Run by building from source.
# Usage:
#   bash scripts/sync-to-gcloud.sh <PROJECT_ID> [SERVICE_NAME] [REGION]
#
# Example:
#   bash scripts/sync-to-gcloud.sh middleeastwar middleeastwar us-central1

PROJECT_ID="${1:-}"
SERVICE_NAME="${2:-middleeastwar}"
REGION="${3:-us-central1}"
CURRENT_STEP="initialization"

log() {
  echo "[sync-to-gcloud] $*"
}

fail() {
  echo
  echo "[sync-to-gcloud] ERROR during step: ${CURRENT_STEP}"
  echo "[sync-to-gcloud] Command: ${BASH_COMMAND}"
  echo "[sync-to-gcloud] Exit code: $?"
  echo
  echo "[sync-to-gcloud] Hints:"
  echo "  - Check PROJECT_ID is the project ID string (not project number)."
  echo "  - Ensure deploy identity has: Cloud Run Admin, Cloud Build Editor,"
  echo "    Artifact Registry Writer, and Service Account User."
  echo "  - Ensure billing is enabled and required APIs are allowed."
}

trap fail ERR

if [[ -z "${PROJECT_ID}" ]]; then
  echo "Usage: bash scripts/sync-to-gcloud.sh <PROJECT_ID> [SERVICE_NAME] [REGION]"
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI not found. Install it first."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

log "Using project: ${PROJECT_ID}"
log "Using service: ${SERVICE_NAME}"
log "Using region: ${REGION}"
log "Working directory: ${ROOT_DIR}"

CURRENT_STEP="validate project id"
if ! gcloud projects describe "${PROJECT_ID}" --format="value(projectId)" >/dev/null 2>&1; then
  echo "[sync-to-gcloud] Invalid or inaccessible project id: ${PROJECT_ID}"
  echo "[sync-to-gcloud] Run: gcloud projects list"
  exit 1
fi

CURRENT_STEP="configure gcloud defaults"
gcloud config set project "${PROJECT_ID}"
gcloud config set run/region "${REGION}"

CURRENT_STEP="enable required APIs"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --project "${PROJECT_ID}" \
  --quiet

CURRENT_STEP="deploy to cloud run"
gcloud run deploy "${SERVICE_NAME}" \
  --source . \
  --region "${REGION}" \
  --allow-unauthenticated \
  --platform managed \
  --project "${PROJECT_ID}" \
  --quiet

CURRENT_STEP="fetch service url"
SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --project "${PROJECT_ID}" --format='value(status.url)')"
log "Deployment completed."
log "Service URL: ${SERVICE_URL}"

