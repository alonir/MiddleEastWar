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

echo "Using project: ${PROJECT_ID}"
echo "Using service: ${SERVICE_NAME}"
echo "Using region: ${REGION}"

gcloud config set project "${PROJECT_ID}"
gcloud config set run/region "${REGION}"

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --project "${PROJECT_ID}"

gcloud run deploy "${SERVICE_NAME}" \
  --source . \
  --region "${REGION}" \
  --allow-unauthenticated \
  --platform managed \
  --project "${PROJECT_ID}"

echo "Deployment completed."

