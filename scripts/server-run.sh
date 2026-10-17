#!/bin/bash
# Run one of the scripts/ commands on the server with the app's database settings loaded.
#   bash scripts/server-run.sh add:officers --panchayat Byndoor --file private/byndoor-officers.csv
# Short on purpose: easy to type in the web console. Run it from anywhere; paths such as
# private/... are resolved from the project folder.
set -e
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/artifacts/api-server/.env"
DATABASE_URL="$(grep -m1 -E '^(export )?DATABASE_URL=' "$ENV_FILE" | sed 's/^export //' | cut -d= -f2- | tr -d "\"'")"
if [ -z "$DATABASE_URL" ]; then
  echo "Could not find DATABASE_URL in $ENV_FILE"
  exit 1
fi
export DATABASE_URL
cd "$ROOT"
script="$1"
shift
exec pnpm --filter @workspace/scripts run "$script" -- "$@"
