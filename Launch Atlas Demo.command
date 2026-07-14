#!/bin/zsh

set -euo pipefail
unsetopt BG_NICE

PROJECT_DIR="${0:A:h}"
DEMO_URL="http://127.0.0.1:3000/?build=1.0.0-rc.1-communication-1"
HEALTH_URL="http://127.0.0.1:3000/health"
BUNDLED_NODE="/Users/kevinmeredith/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
LOG_FILE="$PROJECT_DIR/atlas-local-demo.log"
PID_FILE="$PROJECT_DIR/.atlas-local-demo.pid"

# The fictional demo is restart-safe: records and uploaded files remain on this
# Mac until the .atlas-data folder is intentionally removed.
export LOCAL_DATA_PATH="${LOCAL_DATA_PATH:-$PROJECT_DIR/.atlas-data/repository.bin}"
export DOCUMENT_STORAGE_PROVIDER="${DOCUMENT_STORAGE_PROVIDER:-filesystem}"
export DOCUMENT_STORAGE_PATH="${DOCUMENT_STORAGE_PATH:-$PROJECT_DIR/.atlas-data/documents}"

cd "$PROJECT_DIR"

if /usr/bin/curl --silent --fail "$HEALTH_URL" >/dev/null 2>&1; then
  if [[ -f "$PID_FILE" ]] && [[ "$(<"$PID_FILE")" == <-> ]] && kill -0 "$(<"$PID_FILE")" >/dev/null 2>&1; then
    echo "Atlas is already running from this launcher. Opening the demo now."
    /usr/bin/open "$DEMO_URL"
    exit 0
  fi
  echo "An earlier manually started Atlas server is still using port 3000."
  echo "Run 'Stop Atlas Demo.command' once, then run this launcher again."
  echo "This prevents the browser from silently reopening outdated backend code."
  echo
  read -k 1 "?Press any key to close."
  exit 1
fi

if [[ -x "$BUNDLED_NODE" ]]; then
  NODE_BIN="$BUNDLED_NODE"
elif command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  echo "Atlas could not find Node.js on this Mac."
  echo "Open Atlas through Codex once so its bundled runtime is installed, then try again."
  echo
  read -k 1 "?Press any key to close."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Atlas dependencies are missing from this local copy."
  echo "Restore the complete Phase 1 folder, then try again."
  echo
  read -k 1 "?Press any key to close."
  exit 1
fi

echo "Starting the Atlas Phase 1 fictional demo..."
: > "$LOG_FILE"
/usr/bin/nohup "$NODE_BIN" src/server.js >"$LOG_FILE" 2>&1 </dev/null &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"
disown "$SERVER_PID" 2>/dev/null || true

show_failure() {
  local exit_code="$1"
  echo
  echo "Atlas could not start. The startup report is shown below:"
  echo "----------------------------------------------------------"
  /usr/bin/tail -n 80 "$LOG_FILE" 2>/dev/null || true
  echo "----------------------------------------------------------"
  echo "A copy was saved at: $LOG_FILE"
  echo
  read -k 1 "?Press any key to close."
  exit "$exit_code"
}

for attempt in {1..40}; do
  if /usr/bin/curl --silent --fail "$HEALTH_URL" >/dev/null 2>&1; then
    echo "Atlas is ready. Opening $DEMO_URL"
    /usr/bin/open "$DEMO_URL"
    echo
    echo "Click 'Open fictional demo firm' in the browser."
    echo "Atlas will keep running after this window closes."
    echo "Double-click 'Stop Atlas Demo.command' when you want to stop it."
    exit 0
  fi

  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    set +e
    wait "$SERVER_PID"
    STATUS=$?
    set -e
    /bin/rm -f "$PID_FILE"
    show_failure "$STATUS"
  fi

  /bin/sleep 0.25
done

echo "Atlas did not become ready within ten seconds."
show_failure 1
