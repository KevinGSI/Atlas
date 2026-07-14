#!/bin/zsh

set -euo pipefail
unsetopt BG_NICE

PROJECT_DIR="${0:A:h}"
PID_FILE="$PROJECT_DIR/.atlas-local-demo.pid"
HEALTH_URL="http://127.0.0.1:3000/health"

if [[ ! -f "$PID_FILE" ]]; then
  echo "Atlas is not recorded as running."
  echo
  read -k 1 "?Press any key to close."
  exit 0
fi

SERVER_PID="$(<"$PID_FILE")"
if [[ "$SERVER_PID" != <-> ]]; then
  /bin/rm -f "$PID_FILE"
  echo "Atlas had an invalid local process record. It has been cleared."
  echo
  read -k 1 "?Press any key to close."
  exit 1
fi

if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
  echo "Stopping Atlas..."
  kill "$SERVER_PID"
  for attempt in {1..20}; do
    if ! /usr/bin/curl --silent --fail "$HEALTH_URL" >/dev/null 2>&1; then
      break
    fi
    /bin/sleep 0.25
  done
fi

/bin/rm -f "$PID_FILE"
echo "Atlas has stopped."
echo
read -k 1 "?Press any key to close."
