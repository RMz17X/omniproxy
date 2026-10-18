#!/usr/bin/env bash
# setup-hajimi.sh — configure & run GakkiNoOne/hajimi-king on agent-server (192.168.90.109).
# Usage:
#   ./scripts/setup-hajimi.sh <GITHUB_TOKEN_1> [GITHUB_TOKEN_2 ...]
#   GITHUB_TOKENS="ghp_xxx,ghp_yyy" ./scripts/setup-hajimi.sh
set -euo pipefail

TARGET_HOST="agent@192.168.90.109"
REMOTE_DIR="/workspaces/hajimi-king"

TOKENS="${GITHUB_TOKENS:-}"
if [ $# -gt 0 ]; then
  TOKENS=$(IFS=,; echo "$*")
fi

if [ -z "$TOKENS" ]; then
  echo "Usage: $0 <ghp_token1> [ghp_token2 ...]" >&2
  echo "Or set GITHUB_TOKENS env var." >&2
  exit 1
fi

echo "==> Configuring hajimi-king on ${TARGET_HOST}..."
ssh "$TARGET_HOST" bash -s <<REMOTE_SCRIPT
set -euo pipefail
cd "$REMOTE_DIR"

cat <<ENV > .env
GITHUB_TOKENS=${TOKENS}
PROXY=
DATA_PATH=/app/data
QUERIES_FILE=queries.txt
HAJIMI_CHECK_MODEL=gemini-2.5-flash
DATE_RANGE_DAYS=730

VALID_KEY_PREFIX=keys/keys_valid_
RATE_LIMITED_KEY_PREFIX=keys/key_429_
KEYS_SEND_PREFIX=keys/keys_send_
VALID_KEY_DETAIL_PREFIX=logs/keys_valid_detail_
RATE_LIMITED_KEY_DETAIL_PREFIX=logs/key_429_detail_
KEYS_SEND_DETAIL_PREFIX=logs/keys_send_detail_

FILE_PATH_BLACKLIST=readme,docs,doc/,.md,example,sample,tutorial,test,spec,demo,mock
GEMINI_BALANCER_SYNC_ENABLED=false
GPT_LOAD_SYNC_ENABLED=false
ENV

mkdir -p data/keys data/logs
cat <<'Q' > data/queries.txt
AIzaSy in:file
"AIzaSy" extension:env
"AIzaSy" extension:json
"AIzaSy" filename:.env
AIzaSy path:config
Q

echo "==> starting docker compose..."
docker compose down 2>/dev/null || true
docker compose up -d --build

echo "==> container status:"
docker compose ps
REMOTE_SCRIPT

echo "==> hajimi-king is running on agent-server."
echo "    Keys will be written to ${REMOTE_DIR}/data/keys/keys_valid_*.txt"
