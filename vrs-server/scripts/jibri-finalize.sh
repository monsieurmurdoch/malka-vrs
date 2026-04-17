#!/bin/bash
# ============================================================
# Jibri Finalize Recording Script
#
# Called by Jibri after a recording session completes.
# Uploads the recording to MinIO and notifies the VRS server.
#
# Arguments:
#   $1 — Recording directory path (set by JIBRI_RECORDING_DIR)
#
# Environment variables (set via docker-compose):
#   MINIO_ENDPOINT   — e.g. minio:9000
#   MINIO_ACCESS_KEY — MinIO access key
#   MINIO_SECRET_KEY — MinIO secret key
#   MINIO_BUCKET     — Bucket name (default: voicemail)
#   VRS_CALLBACK_URL — VRS server callback URL
#   JIBRI_CALLBACK_SECRET — Shared secret for callback auth
# ============================================================

set -euo pipefail

RECORDING_DIR="${1:-}"
if [ -z "$RECORDING_DIR" ]; then
    echo "[jibri-finalize] ERROR: No recording directory provided" >&2
    exit 1
fi

echo "[jibri-finalize] Recording directory: $RECORDING_DIR"

# Configuration with defaults
MINIO_ENDPOINT="${MINIO_ENDPOINT:-minio:9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-minioadmin}"
MINIO_BUCKET="${MINIO_BUCKET:-voicemail}"
VRS_CALLBACK_URL="${VRS_CALLBACK_URL:-http://vrs:3001/api/voicemail/jibri-callback}"
JIBRI_CALLBACK_SECRET="${JIBRI_CALLBACK_SECRET:-jibri-callback-secret}"

# Find the recording file (Jibri saves as .mp4 or .webm)
RECORDING_FILE=""
for ext in mp4 webm mkv; do
    FOUND=$(find "$RECORDING_DIR" -name "*.${ext}" -type f 2>/dev/null | head -1)
    if [ -n "$FOUND" ]; then
        RECORDING_FILE="$FOUND"
        break
    fi
done

if [ -z "$RECORDING_FILE" ]; then
    echo "[jibri-finalize] ERROR: No recording file found in $RECORDING_DIR" >&2
    exit 1
fi

echo "[jibri-finalize] Found recording: $RECORDING_FILE"

# Extract the room name from the directory path
# Jibri saves recordings in: <RECORDING_DIR>/<room_name>_<timestamp>/
DIRNAME=$(basename "$RECORDING_DIR")
ROOM_NAME=$(echo "$DIRNAME" | sed 's/_.*//')

# File size in bytes
FILE_SIZE=$(stat -f%z "$RECORDING_FILE" 2>/dev/null || stat -c%s "$RECORDING_FILE" 2>/dev/null || echo "0")

# Build storage key
STORAGE_KEY="recordings/${ROOM_NAME}.mp4"

echo "[jibri-finalize] Uploading to MinIO: ${MINIO_BUCKET}/${STORAGE_KEY}"

# Configure mc (MinIO Client) alias
mc alias set voicemail-minio "http://${MINIO_ENDPOINT}" "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}" 2>/dev/null || {
    echo "[jibri-finalize] WARNING: mc alias setup failed, attempting direct upload"
}

# Upload to MinIO
mc cp "$RECORDING_FILE" "voicemail-minio/${MINIO_BUCKET}/${STORAGE_KEY}" 2>/dev/null || {
    echo "[jibri-finalize] ERROR: MinIO upload failed" >&2
    exit 1
}

echo "[jibri-finalize] Upload complete. Notifying VRS server..."

# Calculate duration using ffprobe if available
DURATION="0"
if command -v ffprobe &>/dev/null; then
    DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$RECORDING_FILE" 2>/dev/null || echo "0")
    # Round to integer seconds
    DURATION=$(printf "%.0f" "$DURATION" 2>/dev/null || echo "0")
fi

# Notify the VRS server
curl -s -X POST "$VRS_CALLBACK_URL" \
    -H "Content-Type: application/json" \
    -H "X-Jibri-Secret: ${JIBRI_CALLBACK_SECRET}" \
    -d "{
        \"roomName\": \"${ROOM_NAME}\",
        \"storageKey\": \"${STORAGE_KEY}\",
        \"fileSizeBytes\": ${FILE_SIZE},
        \"durationSeconds\": ${DURATION},
        \"contentType\": \"video/mp4\"
    }" || {
    echo "[jibri-finalize] WARNING: Callback to VRS server failed"
}

echo "[jibri-finalize] Done."
