#!/bin/zsh

set -euo pipefail
unsetopt BG_NICE

PROJECT_DIR="${0:A:h}"
PID_FILE="$PROJECT_DIR/.atlas-local-demo.pid"
HEALTH_URL="http://127.0.0.1:3000/health"

SERVER_PID=""
if [[ -f "$PID_FILE" ]]; then
  SERVER_PID="$(<"$PID_FILE")"
  if [[ "$SERVER_PID" != <-> ]]; then
    /bin/rm -f "$PID_FILE"
    SERVER_PID=""
  fi
fi

# Atlas may have been started with `pnpm start`, which predates the launcher's
# PID record. Only adopt a port-3000 process when its working directory is this
# exact Atlas checkout; never stop an unrelated local application.
if [[ -z "$SERVER_PID" ]] && command -v /usr/sbin/lsof >/dev/null 2>&1; then
  CANDIDATE_PID="$(/usr/sbin/lsof -nP -tiTCP:3000 -sTCP:LISTEN 2>/dev/null | /usr/bin/head -n 1 || true)"
  if [[ "$CANDIDATE_PID" == <-> ]]; then
    CANDIDATE_CWD="$(/usr/sbin/lsof -a -p "$CANDIDATE_PID" -d cwd -Fn 2>/dev/null | /usr/bin/sed -n 's/^n//p' || true)"
    if [[ "$CANDIDATE_CWD" == "$PROJECT_DIR" ]]; then
      SERVER_PID="$CANDIDATE_PID"
      echo "Found Atlas running from an earlier manual start."
    fi
  fi
fi

if [[ -z "$SERVER_PID" ]]; then
  echo "Atlas is not running."
  echo
  read -k 1 "?Press any key to close."
  exit 0
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
